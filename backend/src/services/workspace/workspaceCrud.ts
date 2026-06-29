import { and, count, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaceMembers, workspaces } from '../../db/schema/workspaces.ts';
import { paginatedQuery } from '../../utils/dbHelpers.ts';
import { UniqueConstraintError, isRawUniqueViolation } from '../../utils/errorResponse.ts';

interface WorkspaceBranding {
	accentColor?: string;
	logoFileId?: number;
}

interface WorkspaceSettings {
	branding?: WorkspaceBranding;
	currency?: string;
	defaultDashboardId?: number;
	timezone?: string;
}

interface WorkspaceRecord {
	createdAt: string;
	description: null | string;
	id: number;
	isDefault: boolean;
	name: string;
	ownerId: number;
	ownerUsername: null | string;
	settings: null | WorkspaceSettings;
	slug: string;
	updatedAt: string;
}

interface ListOptions {
	isSysop: boolean;
	limit?: number;
	page?: number;
	userId: number;
}

/**
 * List workspaces user is a member of. SYSOP sees all workspaces.
 * Returns paginated results with total count.
 *
 * @param options - List options including userId, isSysop, and pagination
 * @returns Paginated workspace list with total count
 */
function list(options: ListOptions): {
	data: WorkspaceRecord[];
	limit: number;
	page: number;
	total: number;
} {
	const db = getDb();

	if (options.isSysop) {
		return paginatedQuery(
			options.page,
			options.limit,
			(limitNum, offset) =>
				db
					.select({ ownerUsername: users.username, workspace: workspaces })
					.from(workspaces)
					.leftJoin(users, eq(users.id, workspaces.ownerId))
					.where(eq(workspaces.isDeleted, false))
					.limit(limitNum)
					.offset(offset)
					.all()
					.map((r) => toRecord(r.workspace, r.ownerUsername)),
			() =>
				db
					.select({ count: count() })
					.from(workspaces)
					.where(eq(workspaces.isDeleted, false))
					.get()
		);
	}

	const baseCondition = and(
		eq(workspaceMembers.userId, options.userId),
		eq(workspaces.isDeleted, false)
	);

	return paginatedQuery(
		options.page,
		options.limit,
		(limitNum, offset) =>
			db
				.select({ ownerUsername: users.username, workspace: workspaces })
				.from(workspaces)
				.innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
				.leftJoin(users, eq(users.id, workspaces.ownerId))
				.where(baseCondition)
				.limit(limitNum)
				.offset(offset)
				.all()
				.map((r) => toRecord(r.workspace, r.ownerUsername)),
		() =>
			db
				.select({ count: count() })
				.from(workspaces)
				.innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
				.where(baseCondition)
				.get()
	);
}

/**
 * Get a workspace by ID.
 *
 * @param id - Workspace ID
 * @returns Workspace record or null
 */
function getById(id: number): null | WorkspaceRecord {
	const db = getDb();
	const row = db
		.select({ ownerUsername: users.username, workspace: workspaces })
		.from(workspaces)
		.leftJoin(users, eq(users.id, workspaces.ownerId))
		.where(and(eq(workspaces.id, id), eq(workspaces.isDeleted, false)))
		.get();

	return row ? toRecord(row.workspace, row.ownerUsername) : null;
}

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

/**
 * Check if a non-deleted workspace exists.
 * @param id
 * @returns Workspace stub or undefined if not found
 */
function findActive(id: number): { id: number } | undefined {
	const db = getDb();
	return db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.id, id), eq(workspaces.isDeleted, false)))
		.get();
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
 * @param id - Workspace ID
 * @param deletedBy - User performing deletion
 * @returns True if deleted
 */
function softDelete(id: number, deletedBy: number): boolean {
	if (!findActive(id)) return false;

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

function toRecord(
	row: typeof workspaces.$inferSelect,
	ownerUsername: null | string
): WorkspaceRecord {
	return {
		createdAt: row.createdAt.toISOString(),
		description: row.description,
		id: row.id,
		isDefault: row.isDefault,
		name: row.name,
		ownerId: row.ownerId,
		ownerUsername,
		settings: (row.settings as null | WorkspaceSettings) ?? null,
		slug: row.slug,
		updatedAt: row.updatedAt.toISOString(),
	};
}

export { create, getById, list, softDelete, update };
export type { CreateInput, UpdateInput, WorkspaceBranding, WorkspaceRecord, WorkspaceSettings };
