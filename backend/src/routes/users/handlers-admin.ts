import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, canModifyRole } from '../../guards/role.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { adminResetUserPassword, getUserById, unlockUser } from '../../services/userService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { clearCsrfToken, clearRefreshTokenHash } from '../../utils/auth/authHelpers.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import { badRequestError, forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Admin handlers                                                     */
/* ------------------------------------------------------------------ */

function handleUnlockUser({
	params,
	set,
	user,
}: {
	params: { id: number };
	set: { status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const targetId = Number(params.id);

	const targetUser = getUserById(targetId);
	if (!targetUser) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	if (!canModifyRole(authUser.role, targetUser.role)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot unlock user with equal or higher role level');
	}

	const unlocked = unlockUser(targetId);
	if (!unlocked) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	logAudit({
		action: 'USER_UNLOCK',
		details: { username: targetUser.username },
		entityId: String(targetId),
		entityType: 'user',
		userId: authUser.id,
	});
	return successResponse();
}

async function handleAdminResetPassword({
	body,
	params,
	set,
	user,
}: {
	body: { mode: 'email' } | { mode: 'set'; password: string };
	params: { id: number };
	set: { status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const targetId = Number(params.id);

	const targetUser = getUserById(targetId);
	if (!targetUser) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	// Non-SYSOP callers cannot reset SYSOP passwords
	if (targetUser.role === 'SYSOP' && authUser.role !== 'SYSOP') {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot reset password for SYSOP users');
	}

	// Cannot reset password of users with equal or higher role (exception: SYSOP self-reset)
	const isSelfReset = targetId === authUser.id;
	if (!isSelfReset && !canModifyRole(authUser.role, targetUser.role)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot reset password for user with equal or higher role level');
	}

	const result = await adminResetUserPassword(authUser.id, targetId, body);

	if (!result.success) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(result.error ?? 'Password reset failed');
	}

	// Revoke all tokens for the target user (clears sessions)
	const config = getConfig();
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	revokeAllUserTokens(targetId, new Date(Date.now() + refreshTtlMs));
	clearRefreshTokenHash(targetId);
	clearCsrfToken(targetId);

	const auditAction = isSelfReset ? 'password.reset.admin.self' : 'password.reset.admin';
	logAudit({
		action: auditAction,
		details: { mode: body.mode, targetUserId: targetId },
		entityId: String(targetId),
		entityType: 'user',
		userId: authUser.id,
	});

	return successResponse();
}

export { handleAdminResetPassword, handleUnlockUser };
