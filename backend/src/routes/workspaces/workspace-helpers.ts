import type { AuthPayload } from '../../plugins/auth.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { MAX_BATCH_SIZE } from '../../constants/pagination.ts';
import { assertUser, isSysop } from '../../guards/role.ts';
import {
	canModifyWorkspaceRole,
	getWorkspaceMemberRole,
	requireWorkspaceRole,
	type WorkspaceMemberRole,
} from '../../guards/workspaceAccess.ts';
import { getById } from '../../services/workspaceService.ts';
import { badRequestError, forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

type SetWithStatus = { headers: Record<string, number | string>; status?: number | string };

/**
 * Look up a workspace by ID, returning 404 if not found.
 */
function findWorkspaceOrThrow(id: number, set: SetWithStatus) {
	const workspace = getById(id);
	if (!workspace) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return {
			error: notFoundError('Workspace') as ReturnType<typeof notFoundError>,
			workspace: undefined,
		};
	}
	return { error: undefined, workspace };
}

/**
 * Verify the requester can assign the given target role in this workspace.
 * SYSOP always passes. Non-SYSOP must have a workspace role higher than targetRole.
 */
function checkRoleAssignment(
	authUser: AuthPayload,
	workspaceId: number,
	targetRole: WorkspaceMemberRole,
	set: SetWithStatus
): null | ReturnType<typeof forbiddenError> {
	if (isSysop(authUser)) return null;
	const wsRole = getWorkspaceMemberRole(authUser.id, workspaceId);
	if (!wsRole || !canModifyWorkspaceRole(wsRole, targetRole)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot assign a role equal to or higher than your own');
	}
	return null;
}

/**
 * Verify the requester can modify the target user in this workspace.
 * SYSOP always passes. Non-SYSOP must have a workspace role higher than target's ws role.
 */
function checkTargetModifiable(
	authUser: AuthPayload,
	workspaceId: number,
	targetUserId: number,
	set: SetWithStatus
): null | ReturnType<typeof forbiddenError> | ReturnType<typeof notFoundError> {
	if (isSysop(authUser)) return null;
	const wsRole = getWorkspaceMemberRole(authUser.id, workspaceId);
	const targetWsRole = getWorkspaceMemberRole(targetUserId, workspaceId);
	if (!targetWsRole) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User is not a member of this workspace');
	}
	if (!wsRole || !canModifyWorkspaceRole(wsRole, targetWsRole)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot modify a member with equal or higher workspace role');
	}
	return null;
}

/**
 * Validate batch array size. Returns error response or null if within limits.
 */
function validateBatchSize(
	count: number,
	set: SetWithStatus
): null | ReturnType<typeof badRequestError> {
	if (count > MAX_BATCH_SIZE) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`);
	}
	return null;
}

/**
 * For non-SYSOP users, verify they are a member of the workspace.
 * Returns the workspace role if valid, or an error response if not a member.
 * SYSOP users always get null error and undefined role (bypasses check).
 */
function requireMembershipOrSysop(
	authUser: AuthPayload,
	workspaceId: number,
	set: SetWithStatus
):
	| { error: null; role: undefined | WorkspaceMemberRole }
	| { error: ReturnType<typeof forbiddenError>; role: undefined } {
	if (isSysop(authUser)) return { error: null, role: undefined };
	const wsRole = getWorkspaceMemberRole(authUser.id, workspaceId);
	if (!wsRole) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return { error: forbiddenError('Not a member of this workspace'), role: undefined };
	}
	return { error: null, role: wsRole };
}

/**
 * Assert auth user and verify workspace ADMIN role in one call.
 * Returns the authenticated user or an error response to short-circuit.
 */
function requireWorkspaceAdmin(
	user: AuthPayload | null,
	workspaceId: number,
	set: SetWithStatus
): { authUser: AuthPayload; ok: true } | { error: unknown; ok: false } {
	const authUser = assertUser(user);
	const guard = requireWorkspaceRole({ set, user: authUser, workspaceId }, 'ADMIN');
	if (guard) return { error: guard, ok: false };
	return { authUser, ok: true };
}

export {
	checkRoleAssignment,
	checkTargetModifiable,
	findWorkspaceOrThrow,
	requireMembershipOrSysop,
	requireWorkspaceAdmin,
	validateBatchSize,
	type SetWithStatus,
};
