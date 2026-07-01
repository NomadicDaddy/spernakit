import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { workspaceMembers } from '../../db/schema/workspaces.ts';
import { getDefaultWorkspaceId } from './workspaceHelpers.ts';

type WorkspaceRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';

interface BatchMemberItemResult {
	error?: string;
	success: boolean;
	userId: number;
}

interface BatchMemberResult {
	failed: number;
	results: BatchMemberItemResult[];
	succeeded: number;
	total: number;
}

function bulkAddMembers(
	workspaceId: number,
	members: { role: WorkspaceRole; userId: number }[]
): BatchMemberResult {
	const db = getDb();
	const results: BatchMemberItemResult[] = [];

	if (members.length === 0) {
		return { failed: 0, results: [], succeeded: 0, total: 0 };
	}

	const userIds = members.map((m) => m.userId);

	const existingUsers = db
		.select({ id: users.id, isDeleted: users.isDeleted })
		.from(users)
		.where(inArray(users.id, userIds))
		.all();

	const userMap = new Map(existingUsers.map((u) => [u.id, u]));

	const existingMemberships = db
		.select({ userId: workspaceMembers.userId })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				inArray(workspaceMembers.userId, userIds)
			)
		)
		.all();

	const existingMemberSet = new Set(existingMemberships.map((m) => m.userId));

	const membersToInsert: { role: WorkspaceRole; userId: number }[] = [];

	for (const { role, userId } of members) {
		const user = userMap.get(userId);

		if (!user || user.isDeleted) {
			results.push({ error: 'User not found', success: false, userId });
			continue;
		}

		if (existingMemberSet.has(userId)) {
			results.push({ error: 'User is already a member', success: false, userId });
			continue;
		}

		membersToInsert.push({ role, userId });
	}

	if (membersToInsert.length > 0) {
		db.insert(workspaceMembers)
			.values(membersToInsert.map((m) => ({ ...m, workspaceId })))
			.run();

		for (const { userId } of membersToInsert) {
			results.push({ success: true, userId });
		}
	}

	const succeeded = results.filter((r) => r.success).length;
	return {
		failed: results.length - succeeded,
		results,
		succeeded,
		total: results.length,
	};
}

function bulkRemoveMembers(workspaceId: number, userIds: number[]): BatchMemberResult {
	const db = getDb();
	const results: BatchMemberItemResult[] = [];

	if (userIds.length === 0) {
		return { failed: 0, results: [], succeeded: 0, total: 0 };
	}

	const existingMemberships = db
		.select({ id: workspaceMembers.id, userId: workspaceMembers.userId })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				inArray(workspaceMembers.userId, userIds)
			)
		)
		.all();

	const membershipMap = new Map(existingMemberships.map((m) => [m.userId, m.id]));

	const idsToDelete: number[] = [];

	for (const userId of userIds) {
		const membershipId = membershipMap.get(userId);
		if (!membershipId) {
			results.push({ error: 'Member not found', success: false, userId });
			continue;
		}

		idsToDelete.push(membershipId);
		results.push({ success: true, userId });
	}

	if (idsToDelete.length > 0) {
		db.delete(workspaceMembers).where(inArray(workspaceMembers.id, idsToDelete)).run();
	}

	const succeeded = results.filter((r) => r.success).length;
	return {
		failed: results.length - succeeded,
		results,
		succeeded,
		total: results.length,
	};
}

function addMemberToDefaultWorkspace(
	userId: number,
	role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER' = 'VIEWER'
): boolean {
	const defaultWorkspaceId = getDefaultWorkspaceId();
	if (defaultWorkspaceId === null) return false;

	// Inline the addMember logic to avoid circular dependency with workspaceMemberService.ts
	const db = getDb();

	const existing = db
		.select({ id: workspaceMembers.id })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, defaultWorkspaceId),
				eq(workspaceMembers.userId, userId)
			)
		)
		.get();

	if (existing) return false;

	const targetUser = db
		.select({ isDeleted: users.isDeleted })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!targetUser || targetUser.isDeleted) return false;

	db.insert(workspaceMembers).values({ role, userId, workspaceId: defaultWorkspaceId }).run();

	return true;
}

function isMemberOfDefaultWorkspace(userId: number): boolean {
	const defaultWorkspaceId = getDefaultWorkspaceId();
	if (defaultWorkspaceId === null) return false;

	const db = getDb();
	const existing = db
		.select({ id: workspaceMembers.id })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, defaultWorkspaceId),
				eq(workspaceMembers.userId, userId)
			)
		)
		.get();

	return Boolean(existing);
}

export {
	addMemberToDefaultWorkspace,
	bulkAddMembers,
	bulkRemoveMembers,
	isMemberOfDefaultWorkspace,
};
export type { BatchMemberItemResult, BatchMemberResult, WorkspaceRole };
