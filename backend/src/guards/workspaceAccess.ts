import { WORKSPACE_ROLE_HIERARCHY, type WorkspaceMemberRole } from 'spernakit-shared';

import type { AuthPayload } from '../plugins/auth.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getUserAuthStatus } from '../services/userService.ts';
import { getMembershipRole, isWorkspaceMember } from '../services/workspaceService.ts';
import { ROLE_HIERARCHY } from '../types/roles.ts';
import {
	badRequestError,
	type ErrorResponse,
	forbiddenError,
	unauthorizedError,
} from '../utils/errorResponse.ts';

const VALID_WORKSPACE_ROLES = new Set<string>(Object.keys(WORKSPACE_ROLE_HIERARCHY));

function validateWorkspaceRole(role: string): WorkspaceMemberRole {
	if (!VALID_WORKSPACE_ROLES.has(role)) {
		throw new Error(`Invalid workspace role: ${role}`);
	}
	return role as WorkspaceMemberRole;
}

interface WorkspaceGuardContext {
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}

type AuthWorkspaceValidation =
	| { authUser: AuthPayload; bypassRoleCheck: boolean; ok: true; workspaceId: number }
	| { ok: false; response: ErrorResponse };

/**
 * Shared auth+workspace+freshStatus validation used by requireWorkspaceAccess and
 * requireWorkspaceRole. Sets ctx.set.status on error so the caller can return the
 * response directly. When bypassRoleCheck is true, the user is SYSOP and the caller
 * MUST grant access without further membership/role checks.
 */
function validateAuthAndWorkspace(ctx: WorkspaceGuardContext): AuthWorkspaceValidation {
	if (!ctx.user) {
		ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
		return { ok: false, response: unauthorizedError() };
	}

	if (!ctx.workspaceId) {
		ctx.set.status = HTTP_STATUS.BAD_REQUEST;
		return { ok: false, response: badRequestError('Missing X-Workspace-ID header') };
	}

	// Verify role from DB to prevent stale JWT claims from granting workspace access
	// after demotion. SYSOP bypasses workspace-level checks.
	const freshStatus = getUserAuthStatus(ctx.user.id);
	if (!freshStatus || freshStatus.isDeleted) {
		ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
		return {
			ok: false,
			response: unauthorizedError('Account has been deleted or not found'),
		};
	}

	const bypassRoleCheck = ROLE_HIERARCHY[freshStatus.role] >= ROLE_HIERARCHY.SYSOP;
	return { authUser: ctx.user, bypassRoleCheck, ok: true, workspaceId: ctx.workspaceId };
}

/**
 * Guard that checks the authenticated user is a member of the current workspace.
 * SYSOP users bypass the membership check.
 *
 * @returns Guard result with error or undefined if access is granted
 */
function requireWorkspaceAccess(ctx: WorkspaceGuardContext): ErrorResponse | undefined {
	const result = validateAuthAndWorkspace(ctx);
	if (!result.ok) return result.response;
	if (result.bypassRoleCheck) return undefined;

	if (!isWorkspaceMember(result.workspaceId, result.authUser.id)) {
		ctx.set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError();
	}

	return undefined;
}

/**
 * Guard for routes that support SYSOP cross-workspace reads when no workspace
 * header is supplied, but must validate any selected workspace for everyone else.
 */
function requireSelectedWorkspaceAccess(ctx: WorkspaceGuardContext): ErrorResponse | undefined {
	if (!ctx.user) {
		ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError();
	}

	const freshStatus = getUserAuthStatus(ctx.user.id);
	if (!freshStatus || freshStatus.isDeleted) {
		ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('Account has been deleted or not found');
	}

	const userIsSysop = ROLE_HIERARCHY[freshStatus.role] >= ROLE_HIERARCHY.SYSOP;
	if (!ctx.workspaceId) {
		if (userIsSysop) return undefined;

		ctx.set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Missing X-Workspace-ID header');
	}

	if (userIsSysop) return undefined;

	if (!isWorkspaceMember(ctx.workspaceId, ctx.user.id)) {
		ctx.set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError();
	}

	return undefined;
}

/**
 * Guard that checks the authenticated user has a minimum workspace-level role.
 * Global ADMIN/SYSOP users bypass the workspace role check.
 *
 * @param minimumRole - Minimum workspace role required (e.g. 'ADMIN', 'MANAGER')
 * @returns Guard result with error or undefined if access is granted
 */
function requireWorkspaceRole(
	ctx: WorkspaceGuardContext,
	minimumRole: WorkspaceMemberRole
): ErrorResponse | undefined {
	const result = validateAuthAndWorkspace(ctx);
	if (!result.ok) return result.response;
	if (result.bypassRoleCheck) return undefined;

	const memberRole = getMembershipRole(result.workspaceId, result.authUser.id);

	if (!memberRole) {
		ctx.set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError();
	}

	const userLevel = WORKSPACE_ROLE_HIERARCHY[validateWorkspaceRole(memberRole)] ?? 0;
	const requiredLevel = WORKSPACE_ROLE_HIERARCHY[minimumRole];

	if (userLevel < requiredLevel) {
		ctx.set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Insufficient workspace permissions');
	}

	return undefined;
}

/**
 * Retrieve a user's workspace-level role from the workspace_members table.
 * Delegates to the workspace service for the actual query.
 *
 * @param userId - The user ID to look up
 * @param workspaceId - The workspace to check membership in
 * @returns The validated workspace role, or null if the user is not a member
 */
function getWorkspaceMemberRole(userId: number, workspaceId: number): null | WorkspaceMemberRole {
	const role = getMembershipRole(workspaceId, userId);
	if (!role) return null;
	return validateWorkspaceRole(role);
}

/**
 * Check if a workspace role is strictly higher than a target workspace role.
 * Used for workspace member management where a member cannot assign/modify/remove
 * roles equal to or higher than their own.
 *
 * @param requesterRole - The requester's workspace role
 * @param targetRole - The target workspace role being assigned or acted upon
 * @returns True if requester can modify the target, false otherwise
 */
function canModifyWorkspaceRole(
	requesterRole: WorkspaceMemberRole,
	targetRole: WorkspaceMemberRole
): boolean {
	const requesterLevel = WORKSPACE_ROLE_HIERARCHY[requesterRole] ?? 0;
	const targetLevel = WORKSPACE_ROLE_HIERARCHY[targetRole] ?? 0;
	return requesterLevel > targetLevel;
}

export {
	canModifyWorkspaceRole,
	getWorkspaceMemberRole,
	requireSelectedWorkspaceAccess,
	requireWorkspaceAccess,
	requireWorkspaceRole,
	validateWorkspaceRole,
};
export type { WorkspaceMemberRole };
