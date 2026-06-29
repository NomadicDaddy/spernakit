import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaceMembers } from '../../db/schema/workspaces.ts';

/** Safety cap for workspace member queries to prevent runaway results. */
const MAX_WORKSPACE_MEMBERS = 500;

interface MemberRecord {
	joinedAt: string;
	role: string;
	userId: number;
	username: string;
	workspaceId: number;
}

function findMembership(workspaceId: number, userId: number): { id: number } | undefined {
	const db = getDb();
	return db
		.select({ id: workspaceMembers.id })
		.from(workspaceMembers)
		.where(
			and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
		)
		.get();
}

function getMembers(workspaceId: number): MemberRecord[] {
	const db = getDb();

	const rows = db
		.select({
			joinedAt: workspaceMembers.joinedAt,
			role: workspaceMembers.role,
			userId: workspaceMembers.userId,
			username: users.username,
			workspaceId: workspaceMembers.workspaceId,
		})
		.from(workspaceMembers)
		.innerJoin(users, eq(users.id, workspaceMembers.userId))
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isDeleted, false)))
		.limit(MAX_WORKSPACE_MEMBERS)
		.all();

	return rows.map((r) => ({
		joinedAt: r.joinedAt.toISOString(),
		role: r.role,
		userId: r.userId,
		username: r.username,
		workspaceId: r.workspaceId,
	}));
}

function addMember(
	workspaceId: number,
	userId: number,
	role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER',
	performedBy?: number
): boolean {
	const db = getDb();

	if (findMembership(workspaceId, userId)) return false;

	const targetUser = db
		.select({ isDeleted: users.isDeleted })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!targetUser || targetUser.isDeleted) return false;

	db.insert(workspaceMembers)
		.values({ ...(performedBy ? { createdBy: performedBy } : {}), role, userId, workspaceId })
		.run();

	return true;
}

function removeMember(workspaceId: number, userId: number): boolean {
	const db = getDb();

	const existing = findMembership(workspaceId, userId);
	if (!existing) return false;

	db.delete(workspaceMembers).where(eq(workspaceMembers.id, existing.id)).run();
	return true;
}

function updateMemberRole(
	workspaceId: number,
	userId: number,
	role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER',
	performedBy?: number
): boolean {
	const db = getDb();

	const existing = findMembership(workspaceId, userId);
	if (!existing) return false;

	db.update(workspaceMembers)
		.set({ role, updatedAt: new Date(), ...(performedBy ? { updatedBy: performedBy } : {}) })
		.where(eq(workspaceMembers.id, existing.id))
		.run();

	return true;
}

function isWorkspaceMember(workspaceId: number, userId: number): boolean {
	return findMembership(workspaceId, userId) !== undefined;
}

/**
 * Get a user's workspace-level role.
 * Lightweight single-column query optimized for guard use.
 *
 * @param workspaceId - Workspace ID
 * @param userId - User ID
 * @returns The membership role string, or null if not a member
 */
function getMembershipRole(workspaceId: number, userId: number): null | string {
	const db = getDb();
	const row = db
		.select({ role: workspaceMembers.role })
		.from(workspaceMembers)
		.where(
			and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
		)
		.get();
	return row?.role ?? null;
}

/**
 * Batched variant of {@link getMembershipRole} for bulk callers that need roles
 * for many users at once. Issues a single SELECT with `userId IN (...)` rather
 * than N sequential lookups.
 *
 * @param workspaceId - Workspace ID
 * @param userIds - User IDs to resolve (empty → empty map, no query issued)
 * @returns Map keyed by userId with the user's role; non-members are absent
 */
function getMembershipRoles(workspaceId: number, userIds: number[]): Map<number, string> {
	if (userIds.length === 0) return new Map();
	const db = getDb();
	const rows = db
		.select({ role: workspaceMembers.role, userId: workspaceMembers.userId })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				inArray(workspaceMembers.userId, userIds)
			)
		)
		.all();
	return new Map(rows.map((r) => [r.userId, r.role]));
}

export {
	addMember,
	getMembershipRole,
	getMembershipRoles,
	getMembers,
	isWorkspaceMember,
	removeMember,
	updateMemberRole,
};
export type { MemberRecord };
