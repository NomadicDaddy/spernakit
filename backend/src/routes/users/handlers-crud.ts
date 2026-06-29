import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { AuthPayload } from '../../plugins/auth.ts';
import type { UserRole } from '../../types/roles.ts';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../../constants/pagination.ts';
import { assertUser, canModifyRole } from '../../guards/role.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { getAuthSettings } from '../../services/authService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import {
	createUser,
	getUserById,
	listUsers,
	softDeleteUser,
	updateUser,
} from '../../services/userService.ts';
import { broadcastCrudToAdmins } from '../../services/websocketService.ts';
import { dataResponse, paginatedResponse, successResponse } from '../../utils/apiResponse.ts';
import { clearCsrfToken, clearRefreshTokenHash } from '../../utils/auth/authHelpers.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import {
	badRequestError,
	conflictError,
	forbiddenError,
	isUniqueConstraintError,
	notFoundError,
} from '../../utils/errorResponse.ts';
import {
	parseFields,
	projectFields,
	USER_LIST_FIELDS,
	validateFields,
} from '../../utils/fieldSelection.ts';

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

function handleListUsers({
	query,
}: {
	query: {
		fields?: string;
		limit?: number;
		page?: number;
		role?: UserRole;
		search?: string;
	};
}) {
	const result = listUsers({
		limit: query.limit ?? DEFAULT_PAGE_LIMIT,
		page: query.page ?? DEFAULT_PAGE,
		...(query.role ? { role: query.role } : {}),
		...(query.search ? { search: query.search } : {}),
	});

	const fields = validateFields(parseFields(query.fields), USER_LIST_FIELDS);
	return paginatedResponse(result, projectFields(result.data, fields));
}

function handleGetUserById({
	params,
	set,
}: {
	params: { id: number };
	set: { status?: number | string };
}) {
	const found = getUserById(Number(params.id));
	if (!found) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}
	return dataResponse(found);
}

async function handleCreateUser({
	body,
	set,
	user,
}: {
	body: { email: string; password: string; role?: UserRole; username: string };
	set: { status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const targetRole = body.role ?? 'VIEWER';

	if (!canModifyRole(authUser.role, targetRole)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot create user with equal or higher role level');
	}

	const { requireSpecialCharacter } = getAuthSettings();
	const strengthError = validatePasswordStrength(body.password, { requireSpecialCharacter });
	if (strengthError) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(strengthError);
	}

	try {
		const created = await createUser({
			createdBy: authUser.id,
			email: body.email,
			password: body.password,
			role: targetRole,
			username: body.username,
		});
		trackEvent({
			eventCategory: 'conversion',
			eventName: 'user_registered',
			metadata: { role: targetRole },
			userId: authUser.id,
		});
		logAudit({
			action: 'USER_CREATE',
			details: { email: created.email, role: targetRole, username: created.username },
			entityId: String(created.id),
			entityType: 'user',
			userId: authUser.id,
		});
		broadcastCrudToAdmins(WS_CRUD_EVENTS.USER_CREATED, { id: created.id });
		set.status = HTTP_STATUS.CREATED;
		return dataResponse(created);
	} catch (err) {
		if (isUniqueConstraintError(err)) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError(err.message);
		}
		throw err;
	}
}

function handleUpdateUser({
	body,
	params,
	set,
	user,
}: {
	body: { email?: string; role?: UserRole; username?: string };
	params: { id: number };
	set: { status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);

	const targetUser = getUserById(Number(params.id));
	if (!targetUser) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	if (!canModifyRole(authUser.role, targetUser.role)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot modify user with equal or higher role level');
	}

	if (body.role !== undefined && !canModifyRole(authUser.role, body.role)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot assign role equal to or higher than your own');
	}

	const roleChanged = body.role !== undefined && body.role !== targetUser.role;
	const emailChanged = body.email !== undefined && body.email !== targetUser.email;

	try {
		const updated = updateUser(Number(params.id), {
			...(body.email !== undefined ? { email: body.email } : {}),
			...(body.role !== undefined ? { role: body.role } : {}),
			...(body.username !== undefined ? { username: body.username } : {}),
			updatedBy: authUser.id,
		});
		if (!updated) {
			set.status = HTTP_STATUS.NOT_FOUND;
			return notFoundError('User');
		}

		// Force re-authentication when role or email changes
		if (roleChanged || emailChanged) {
			const config = getConfig();
			const refreshTtlMs = parseDurationMs(
				config.security.jwtRefreshExpiresIn,
				DEFAULT_REFRESH_TTL_MS
			);
			revokeAllUserTokens(Number(params.id), new Date(Date.now() + refreshTtlMs));
			clearRefreshTokenHash(Number(params.id));
			clearCsrfToken(Number(params.id));
		}

		logAudit({
			action: 'USER_UPDATE',
			details: {
				changes: {
					...(body.email !== undefined ? { email: body.email } : {}),
					...(body.role !== undefined ? { role: body.role } : {}),
					...(body.username !== undefined ? { username: body.username } : {}),
				},
				...(roleChanged ? { roleChange: { from: targetUser.role, to: body.role } } : {}),
			},
			entityId: String(params.id),
			entityType: 'user',
			userId: authUser.id,
		});
		broadcastCrudToAdmins(WS_CRUD_EVENTS.USER_UPDATED, { id: updated.id });
		return dataResponse(updated);
	} catch (err) {
		if (isUniqueConstraintError(err)) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError(err.message);
		}
		throw err;
	}
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

	const deleted = softDeleteUser(targetId, authUser.id);
	if (!deleted) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	// Revoke all tokens and clear stored credentials for the deleted user
	const config = getConfig();
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	revokeAllUserTokens(targetId, new Date(Date.now() + refreshTtlMs));
	clearRefreshTokenHash(targetId);
	clearCsrfToken(targetId);

	logAudit({
		action: 'USER_DELETE',
		details: {
			...(targetUser ? { role: targetUser.role, username: targetUser.username } : {}),
		},
		entityId: String(targetId),
		entityType: 'user',
		userId: authUser.id,
	});
	broadcastCrudToAdmins(WS_CRUD_EVENTS.USER_DELETED, { id: targetId });
	return successResponse();
}

export { handleCreateUser, handleDeleteUser, handleGetUserById, handleListUsers, handleUpdateUser };
