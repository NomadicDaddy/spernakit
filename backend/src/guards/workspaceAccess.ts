import { WORKSPACE_ROLE_HIERARCHY, type WorkspaceMemberRole } from 'spernakit-shared';

import type { AuthPayload } from '../plugins/auth.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getUserAuthStatus } from '../services/userService.ts';
import { getMembershipRole, isWorkspaceMember } from '../services/workspaceService.ts';
import { ROLE_HIERARCHY } from '../types/roles.ts';
import { type ErrorResponse, forbiddenError, unauthorizedError } from '../utils/errorResponse.ts';
import {
	missingWorkspaceHeaderError,
	unknownWorkspaceError,
	workspaceExists,
} from './workspaceHeader.ts';

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

	/*
	 * Only ever absent, never malformed: `workspacePlugin` answers a header it cannot read
	 * before any handler runs, so a null here means the caller sent no header at all.
	 */
	if (!ctx.workspaceId) {
		return { ok: false, response: missingWorkspaceHeaderError(ctx.set) };
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
	// A SYSOP can reach every workspace, so one they named and that is not there is absent rather
	// than off limits, and saying so is what stops the request from being answered against some
	// wider set of rows instead. Everybody else is answered by the membership check that follows,
	// which deliberately gives the same reply either way.
	if (bypassRoleCheck && !workspaceExists(ctx.workspaceId)) {
		return { ok: false, response: unknownWorkspaceError(ctx.set) };
	}
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
	/*
	 * As above, a null id means no header was sent, which is the cross-workspace request this
	 * guard exists to allow a SYSOP to make. A header that could not be read never reaches here.
	 */
	if (!ctx.workspaceId) {
		if (userIsSysop) return undefined;

		return missingWorkspaceHeaderError(ctx.set);
	}

	// A SYSOP who named a workspace asked to be narrowed to it, so the id is checked rather than
	// waved through: answering an absent workspace with the cross-workspace listing would hand back
	// more than was asked for, which is the one wrong answer here.
	if (userIsSysop) {
		return workspaceExists(ctx.workspaceId) ? undefined : unknownWorkspaceError(ctx.set);
	}

	if (!isWorkspaceMember(ctx.workspaceId, ctx.user.id)) {
		ctx.set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError();
	}

	return undefined;
}

/**
 * Answer whether a user holds at least `minimumRole` in a workspace.
 *
 * This is the read-only half of the workspace-role question, and the one place that decides what
 * holding the role means. A route that reports a capability calls this; a route that rejects a
 * request calls {@link requireWorkspaceRole}, which is built on it and adds only the rejection.
 *
 * It takes no guard context, writes no status, and constructs no response body. The alternative
 * callers reached for before it existed was invoking the guard against a throwaway context and
 * testing the result for undefined, which built and discarded an ErrorResponse on every
 * capability read and would become a real side effect the moment the guard gained logging,
 * auditing, lockout or throwing behaviour.
 *
 * The decision applies every rule the guard applies to it: the role is read fresh from the
 * database rather than from JWT claims, a missing or deleted account is denied, a global SYSOP is
 * granted without workspace membership, and a non-member is denied.
 *
 * @param userId - The user whose access is in question
 * @param workspaceId - The workspace being asked about
 * @param minimumRole - Minimum workspace role required (e.g. 'ADMIN', 'MANAGER')
 * @returns True when the user holds at least the minimum workspace role
 */
function hasWorkspaceRole(
	userId: number,
	workspaceId: number,
	minimumRole: WorkspaceMemberRole,
): boolean {
	// Verify role from DB to prevent stale JWT claims from granting workspace access after
	// demotion. SYSOP bypasses workspace-level checks.
	const freshStatus = getUserAuthStatus(userId);
	if (!freshStatus || freshStatus.isDeleted) return false;
	if (ROLE_HIERARCHY[freshStatus.role] >= ROLE_HIERARCHY.SYSOP) return true;

	const memberRole = getMembershipRole(workspaceId, userId);
	if (!memberRole) return false;

	// validateWorkspaceRole throws on a role the hierarchy does not know. That is a data-integrity
	// assertion about the row, not a decision about the request, and it is deliberately shared with
	// the guard so a capability check and a rejection cannot disagree about a corrupt membership.
	const userLevel = WORKSPACE_ROLE_HIERARCHY[validateWorkspaceRole(memberRole)] ?? 0;
	return userLevel >= WORKSPACE_ROLE_HIERARCHY[minimumRole];
}

/**
 * Guard that checks the authenticated user has a minimum workspace-level role.
 * Global ADMIN/SYSOP users bypass the workspace role check.
 *
 * Expressed in terms of {@link hasWorkspaceRole}: the predicate decides whether the role is held,
 * and this function adds the status write and the response body. Use it when a request must be
 * rejected, and the predicate when a caller only needs the answer.
 *
 * @param minimumRole - Minimum workspace role required (e.g. 'ADMIN', 'MANAGER')
 * @returns Guard result with error or undefined if access is granted
 */
function requireWorkspaceRole(
	ctx: WorkspaceGuardContext,
	minimumRole: WorkspaceMemberRole,
): ErrorResponse | undefined {
	const result = validateAuthAndWorkspace(ctx);
	if (!result.ok) return result.response;
	if (result.bypassRoleCheck) return undefined;

	if (hasWorkspaceRole(result.authUser.id, result.workspaceId, minimumRole)) return undefined;

	// The predicate has already denied; the remaining lookup only chooses how to say so. It costs
	// one membership read on the rejection path and keeps a single owner for the grant decision.
	ctx.set.status = HTTP_STATUS.FORBIDDEN;
	return getMembershipRole(result.workspaceId, result.authUser.id)
		? forbiddenError('Insufficient workspace permissions')
		: forbiddenError();
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
	targetRole: WorkspaceMemberRole,
): boolean {
	const requesterLevel = WORKSPACE_ROLE_HIERARCHY[requesterRole] ?? 0;
	const targetLevel = WORKSPACE_ROLE_HIERARCHY[targetRole] ?? 0;
	return requesterLevel > targetLevel;
}

export {
	canModifyWorkspaceRole,
	getWorkspaceMemberRole,
	hasWorkspaceRole,
	requireSelectedWorkspaceAccess,
	requireWorkspaceAccess,
	requireWorkspaceRole,
	validateWorkspaceRole,
};
export type { WorkspaceMemberRole };
