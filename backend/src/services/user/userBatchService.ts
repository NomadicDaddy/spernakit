import { inArray } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { ROLE_HIERARCHY, type UserRole, validateUserRole } from '../../types/roles.ts';
import { canDeleteUser, canModifyUserRole } from './userValidationService.ts';

interface BatchItemResult {
	error?: string | undefined;
	id: number;
	success: boolean;
}

interface BatchResult {
	failed: number;
	results: BatchItemResult[];
	succeeded: number;
	total: number;
}

interface DeleteValidation {
	idsToQuery: number[];
	results: BatchItemResult[];
	selfDeleteIds: Set<number>;
}

function validateSelfDelete(ids: number[], deletedBy: number): DeleteValidation {
	const results: BatchItemResult[] = [];
	const selfDeleteIds = new Set<number>();

	for (const id of ids) {
		if (id === deletedBy) {
			results.push({ error: 'Cannot delete your own account', id, success: false });
			selfDeleteIds.add(id);
		}
	}

	const idsToQuery = ids.filter((id) => !selfDeleteIds.has(id));
	return { idsToQuery, results, selfDeleteIds };
}

interface UserRecord {
	id: number;
	isDeleted: boolean | null;
	role: string;
}

function validateUserForDeletion(
	id: number,
	user: undefined | UserRecord,
	requesterRoleLevel: number
): { error?: string; valid: boolean } {
	if (!user) {
		return { error: 'User not found', valid: false };
	}
	if (user.isDeleted) {
		return { error: 'User already deleted', valid: false };
	}
	if (!canDeleteUser(requesterRoleLevel, validateUserRole(user.role))) {
		return { error: 'Cannot delete user with equal or higher role level', valid: false };
	}
	return { valid: true };
}

function executeBulkDelete(validIds: number[], deletedBy: number): BatchItemResult[] {
	if (validIds.length === 0) return [];

	const db = getDb();
	db.update(users)
		.set({
			deletedAt: new Date(),
			deletedBy,
			isDeleted: true,
			lastLoginIp: null,
			updatedAt: new Date(),
		})
		.where(inArray(users.id, validIds))
		.run();

	return validIds.map((id) => ({ id, success: true }));
}

function bulkDeleteUsers(
	ids: number[],
	deletedBy: number,
	requesterRoleLevel: number
): BatchResult {
	const { idsToQuery, results } = validateSelfDelete(ids, deletedBy);

	if (idsToQuery.length === 0) {
		return buildBatchResult(results);
	}

	const db = getDb();
	const existingUsers = db
		.select({ id: users.id, isDeleted: users.isDeleted, role: users.role })
		.from(users)
		.where(inArray(users.id, idsToQuery))
		.all();

	const userMap = new Map(existingUsers.map((u) => [u.id, u]));
	const validIds: number[] = [];

	for (const id of idsToQuery) {
		const validation = validateUserForDeletion(id, userMap.get(id), requesterRoleLevel);
		if (validation.valid) {
			validIds.push(id);
		} else {
			results.push({ error: validation.error, id, success: false });
		}
	}

	results.push(...executeBulkDelete(validIds, deletedBy));
	return buildBatchResult(results);
}

interface RoleUpdateValidation {
	error?: string;
	id: number;
	valid: boolean;
}

function validateRoleUpdate(
	id: number,
	role: UserRole,
	user: undefined | UserRecord,
	requesterRoleLevel: number
): RoleUpdateValidation {
	if (!user || user.isDeleted) {
		return { error: 'User not found', id, valid: false };
	}
	if (!canModifyUserRole(requesterRoleLevel, validateUserRole(user.role))) {
		return { error: 'Cannot modify user with equal or higher role level', id, valid: false };
	}
	const newRoleLevel = ROLE_HIERARCHY[role] ?? 0;
	if (newRoleLevel >= requesterRoleLevel) {
		return { error: 'Cannot assign role equal to or higher than your own', id, valid: false };
	}
	return { id, valid: true };
}

function executeBulkRoleUpdates(updates: { id: number; role: UserRole }[]): BatchItemResult[] {
	if (updates.length === 0) return [];

	const db = getDb();
	const now = new Date();
	const idsByRole = new Map<UserRole, number[]>();
	for (const { id, role } of updates) {
		const ids = idsByRole.get(role);
		if (ids) ids.push(id);
		else idsByRole.set(role, [id]);
	}

	db.transaction((tx) => {
		for (const [role, ids] of idsByRole) {
			tx.update(users).set({ role, updatedAt: now }).where(inArray(users.id, ids)).run();
		}
	});

	return updates.map(({ id }) => ({ id, success: true }));
}

function bulkUpdateUserRoles(
	updates: { id: number; role: UserRole }[],
	requesterRoleLevel: number
): BatchResult {
	if (updates.length === 0) {
		return { failed: 0, results: [], succeeded: 0, total: 0 };
	}

	const db = getDb();
	const ids = updates.map((u) => u.id);
	const existingUsers = db
		.select({ id: users.id, isDeleted: users.isDeleted, role: users.role })
		.from(users)
		.where(inArray(users.id, ids))
		.all();

	const userMap = new Map(existingUsers.map((u) => [u.id, u]));
	const results: BatchItemResult[] = [];
	const validUpdates: { id: number; role: UserRole }[] = [];

	for (const { id, role } of updates) {
		const validation = validateRoleUpdate(id, role, userMap.get(id), requesterRoleLevel);
		if (validation.valid) {
			validUpdates.push({ id, role });
		} else {
			results.push({ error: validation.error, id, success: false });
		}
	}

	results.push(...executeBulkRoleUpdates(validUpdates));
	return buildBatchResult(results);
}

function buildBatchResult(results: BatchItemResult[]): BatchResult {
	const succeeded = results.filter((r) => r.success).length;
	return {
		failed: results.length - succeeded,
		results,
		succeeded,
		total: results.length,
	};
}

export { bulkDeleteUsers, bulkUpdateUserRoles };
