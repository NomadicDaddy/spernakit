import { and, count, eq } from 'drizzle-orm';

import type { UserRole } from '../../types/roles.ts';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaces } from '../../db/schema/workspaces.ts';
import { UniqueConstraintError, isRawUniqueViolation } from '../../utils/errorResponse.ts';
import { hashPassword } from '../authService.ts';
import {
	getAllUsersSecurityInfo,
	getTotalUserCount,
	getUserAuthStatus,
	getUserRefreshInfo,
} from './userAuthQueries.ts';
import { bulkDeleteUsers, bulkUpdateUserRoles } from './userBatchService.ts';
import {
	type UpdateInput,
	type UserPublic,
	buildUpdateUserPayload,
	enforceUserUniqueness,
	getExistingUserForUpdate,
	getUserCache,
} from './userCrudHelpers.ts';
import { getUserById, listUsers, userPublicFields } from './userQueries.ts';

interface CreateInput {
	createdBy?: number;
	email: string;
	password: string;
	role: UserRole;
	username: string;
}

/**
 * Create a new user.
 *
 * @param input - User data
 * @returns Created user (without password hash)
 */
async function createUser(input: CreateInput): Promise<UserPublic> {
	const db = getDb();
	const passwordHash = await hashPassword(input.password);

	const created = db.transaction((tx) => {
		try {
			tx.insert(users)
				.values({
					...(input.createdBy ? { createdBy: input.createdBy } : {}),
					email: input.email,
					passwordHash,
					role: input.role,
					username: input.username,
				})
				.run();
		} catch (err: unknown) {
			if (
				isRawUniqueViolation(err, 'users.username') ||
				isRawUniqueViolation(err, 'users_username')
			) {
				throw new UniqueConstraintError('Username already taken');
			}
			if (
				isRawUniqueViolation(err, 'users.email') ||
				isRawUniqueViolation(err, 'users_email')
			) {
				throw new UniqueConstraintError('Email already taken');
			}
			throw err;
		}

		const row = tx
			.select(userPublicFields)
			.from(users)
			.where(eq(users.username, input.username))
			.get();

		if (!row) {
			throw new Error(`Failed to retrieve user '${input.username}' after creation`);
		}

		return row;
	});

	return created;
}

/**
 * Update an existing user.
 *
 * @param id - User ID
 * @param input - Fields to update
 * @returns Updated user or null if not found
 */
function updateUser(id: number, input: UpdateInput): null | UserPublic {
	const db = getDb();
	const userCache = getUserCache();

	const existing = getExistingUserForUpdate(id);
	if (!existing || existing.isDeleted) return null;

	enforceUserUniqueness(id, input, existing);
	const updateData = buildUpdateUserPayload(input, existing);

	const [updated] = db
		.update(users)
		.set(updateData)
		.where(eq(users.id, id))
		.returning(userPublicFields)
		.all();

	userCache.delete(id);
	if (updated) {
		userCache.set(id, updated);
	}
	return updated ?? null;
}

/**
 * Soft delete a user.
 *
 * Mirrors the hard-delete `restrict` FK on workspaces.ownerId: a user who owns
 * active workspaces cannot be deleted until ownership is transferred. Clears
 * session credentials (refresh token hash, CSRF token) so a soft-deleted user
 * cannot keep refreshing sessions.
 *
 * @param id - User ID
 * @param deletedBy - ID of user performing the delete
 * @returns True if deleted
 * @throws Error when the user owns active workspaces
 */
function softDeleteUser(id: number, deletedBy: number): boolean {
	const db = getDb();
	const userCache = getUserCache();
	const existing = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, false)))
		.get();

	if (!existing) return false;

	const ownedWorkspaces = db
		.select({ count: count() })
		.from(workspaces)
		.where(and(eq(workspaces.ownerId, id), eq(workspaces.isDeleted, false)))
		.get();
	const ownedCount = ownedWorkspaces?.count ?? 0;
	if (ownedCount > 0) {
		throw new Error(
			`Cannot delete user: user owns ${ownedCount} active workspace(s). ` +
				'Transfer workspace ownership before deleting this account.'
		);
	}

	db.update(users)
		.set({
			csrfToken: null,
			deletedAt: new Date(),
			deletedBy,
			isDeleted: true,
			lastLoginIp: null,
			refreshTokenHash: null,
			updatedAt: new Date(),
		})
		.where(eq(users.id, id))
		.run();

	userCache.delete(id);
	return true;
}

export {
	bulkDeleteUsers,
	bulkUpdateUserRoles,
	createUser,
	getAllUsersSecurityInfo,
	getTotalUserCount,
	getUserAuthStatus,
	getUserById,
	getUserRefreshInfo,
	listUsers,
	softDeleteUser,
	updateUser,
};
