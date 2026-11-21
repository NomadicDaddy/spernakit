import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, canModifyRole } from '../../guards/role.ts';
import { actorFields, log as logAudit } from '../../services/auditService.ts';
import { getUserById, softDeleteUser } from '../../services/userService.ts';
import { broadcastCrudToAdmins } from '../../services/websocketService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { clearCsrfToken } from '../../utils/auth/authHelpers.ts';
import { endAllRefreshSessions } from '../../utils/auth/refreshSessions.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import {
	badRequestError,
	conflictError,
	forbiddenError,
	isResourceProtectedError,
	notFoundError,
	RESOURCE_ERROR_CODES,
} from '../../utils/errorResponse.ts';

/*  The user delete handler, split from handlers-crud.ts so both stay under the line cap.  */

/**
 * Soft-delete the target, or say why not: 409 RESOURCE_PROTECTED when the user still owns an
 * active workspace, 404 when there is no such active user.
 *
 * @param targetId - The user to delete
 * @param actorId - The user performing the delete
 * @param set - The response status setter
 * @returns The refusal to send, or null once the user is deleted
 */
function softDeleteOrRefuse(
	targetId: number,
	actorId: number,
	set: { status?: number | string },
): null | ReturnType<typeof conflictError> {
	let deleted: boolean;
	try {
		deleted = softDeleteUser(targetId, actorId);
	} catch (err) {
		if (!isResourceProtectedError(err)) throw err;
		set.status = HTTP_STATUS.CONFLICT;
		return conflictError(err.message, RESOURCE_ERROR_CODES.RESOURCE_PROTECTED);
	}
	if (deleted) return null;
	set.status = HTTP_STATUS.NOT_FOUND;
	return notFoundError('User');
}

function handleDeleteUser({
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

	if (targetId === authUser.id) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Cannot delete your own account');
	}

	const targetUser = getUserById(targetId);
	if (targetUser && !canModifyRole(authUser.role, targetUser.role)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot delete user with equal or higher role level');
	}

	const refusal = softDeleteOrRefuse(targetId, authUser.id, set);
	if (refusal) return refusal;

	// Revoke all tokens and clear stored credentials for the deleted user
	const config = getConfig();
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS,
	);
	revokeAllUserTokens(targetId, new Date(Date.now() + refreshTtlMs));
	endAllRefreshSessions(targetId);
	clearCsrfToken(targetId);

	logAudit({
		action: 'USER_DELETE',
		details: {
			...(targetUser ? { role: targetUser.role, username: targetUser.username } : {}),
		},
		entityId: String(targetId),
		entityType: 'user',
		...actorFields(authUser),
	});
	broadcastCrudToAdmins(WS_CRUD_EVENTS.USER_DELETED, { id: targetId });
	return successResponse();
}

export { handleDeleteUser };
