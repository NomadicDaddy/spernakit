import { eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaceMembers, workspaces } from '../../db/schema/workspaces.ts';
import { isRawUniqueViolation, UniqueConstraintError } from '../../utils/errorResponse.ts';
import {
	findActive,
	getById,
	isDefaultWorkspace,
	toRecord,
	type WorkspaceRecord,
	type WorkspaceSettings,
} from './workspaceQueries.ts';

interface CreateInput {
	description?: string | undefined;
	name: string;
	ownerId: number;
	slug: string;
}

/**
 * Create a new workspace and add owner as ADMIN member.
 *
 * @param input - Workspace creation parameters
 * @returns Created workspace record
 */
function create(input: CreateInput): WorkspaceRecord {
	const db = getDb();

	const result = db.transaction((tx) => {
		let workspace: typeof workspaces.$inferSelect;
		try {
			workspace = tx
				.insert(workspaces)
				.values({
					createdBy: input.ownerId,
					name: input.name,
					ownerId: input.ownerId,
					slug: input.slug,
					...(input.description !== undefined ? { description: input.description } : {}),
				})
				.returning()
				.get();
		} catch (err: unknown) {
			if (
				isRawUniqueViolation(err, 'workspaces.slug') ||
				isRawUniqueViolation(err, 'workspaces_slug')
			) {
				throw new UniqueConstraintError('Workspace slug already exists');
			}
			throw err;
		}

		tx.insert(workspaceMembers)
			.values({
				createdBy: input.ownerId,
				role: 'ADMIN',
				userId: input.ownerId,
				workspaceId: workspace.id,
			})
			.run();

		return workspace;
	});

	// Resolve owner username to match the list()/getById() response shape.
	const owner = db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, input.ownerId))
		.get();

	return toRecord(result, owner?.username ?? null);
}

interface UpdateInput {
	description?: string | undefined;
	name?: string | undefined;
	settings?: undefined | WorkspaceSettings;
	updatedBy?: number;
}

/**
 * Update a workspace.
 *
 * @param id - Workspace ID
 * @param input - Fields to update
 * @returns Updated workspace record or null
 */
function update(id: number, input: UpdateInput): null | WorkspaceRecord {
	if (!findActive(id)) return null;

	const db = getDb();
	const { settings: inputSettings, updatedBy, ...fields } = input;
	db.update(workspaces)
		.set({
			...fields,
			settings: inputSettings as Record<string, unknown>,
			updatedAt: new Date(),
			...(updatedBy ? { updatedBy } : {}),
		})
		.where(eq(workspaces.id, id))
		.run();

	return getById(id);
}

/**
 * Soft-delete a workspace.
 *
 * Refuses to delete the default workspace. New accounts are joined to it by
 * `getDefaultWorkspaceId()` during self-registration and OAuth sign-up, and
 * deleting it used to be unrecoverable: soft-deleted rows keep their slug in
 * the unique index, so the slug "default" can never be taken again and nothing
 * outside the seed ever writes `isDefault`. Every subsequent registration then
 * silently produced a user with no workspace membership at all.
 *
 * @param id - Workspace ID
 * @param deletedBy - User performing deletion
 * @returns True if deleted, false if not found or the workspace is the default
 */
function softDelete(id: number, deletedBy: number): boolean {
	if (!findActive(id)) return false;
	if (isDefaultWorkspace(id)) return false;

	const db = getDb();
	db.update(workspaces)
		.set({
			deletedAt: new Date(),
			deletedBy,
			isDeleted: true,
			updatedAt: new Date(),
		})
		.where(eq(workspaces.id, id))
		.run();

	return true;
}

export { create, softDelete, update };
export type { CreateInput, UpdateInput };
