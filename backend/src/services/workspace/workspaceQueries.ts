import { and, count, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaceMembers, workspaces } from '../../db/schema/workspaces.ts';
import { paginatedQuery } from '../../utils/dbHelpers.ts';

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
			(limit, offset) =>
				db
					.select({ ownerUsername: users.username, workspace: workspaces })
					.from(workspaces)
					.leftJoin(users, eq(users.id, workspaces.ownerId))
					.where(eq(workspaces.isDeleted, false))
					.limit(limit)
					.offset(offset)
					.all()
					.map((row) => toRecord(row.workspace, row.ownerUsername)),
			() =>
				db
					.select({ count: count() })
					.from(workspaces)
					.where(eq(workspaces.isDeleted, false))
					.get()
		);
	}

	const where = and(eq(workspaceMembers.userId, options.userId), eq(workspaces.isDeleted, false));
	return paginatedQuery(
		options.page,
		options.limit,
		(limit, offset) =>
			db
				.select({ ownerUsername: users.username, workspace: workspaces })
				.from(workspaces)
				.innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
				.leftJoin(users, eq(users.id, workspaces.ownerId))
				.where(where)
				.limit(limit)
				.offset(offset)
				.all()
				.map((row) => toRecord(row.workspace, row.ownerUsername)),
		() =>
			db
				.select({ count: count() })
				.from(workspaces)
				.innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
				.where(where)
				.get()
	);
}

function getById(id: number): null | WorkspaceRecord {
	const row = getDb()
		.select({ ownerUsername: users.username, workspace: workspaces })
		.from(workspaces)
		.leftJoin(users, eq(users.id, workspaces.ownerId))
		.where(and(eq(workspaces.id, id), eq(workspaces.isDeleted, false)))
		.get();

	return row ? toRecord(row.workspace, row.ownerUsername) : null;
}

function findActive(id: number): { id: number } | undefined {
	return getDb()
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.id, id), eq(workspaces.isDeleted, false)))
		.get();
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

export { findActive, getById, list, toRecord };
export type { WorkspaceBranding, WorkspaceRecord, WorkspaceSettings };
