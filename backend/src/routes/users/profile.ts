import { Elysia, t } from 'elysia';
import jwt from 'jsonwebtoken';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from '../../constants/validation.ts';
import { assertUser, requireAuth } from '../../guards/role.ts';
import { authPlugin, parseCookies } from '../../plugins/auth.ts';
import {
	changeUserPassword,
	getAuthSettings,
	requestEmailChange,
} from '../../services/authService.ts';
import {
	sendEmailChangeConfirmation,
	sendEmailChangeNotification,
} from '../../services/emailService.ts';
import { updateUser, usernameExists } from '../../services/userService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { clearAuthCookies } from '../../utils/auth/authHelpers.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { revokeAccessToken, revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { sendEmailWithRetry } from '../../utils/emailRetry.ts';
import {
	AUTH_ERROR_CODES,
	VALIDATION_ERROR_CODES,
	badRequestError,
	conflictError,
	isUniqueConstraintError,
	notFoundError,
} from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';
import {
	checkUsernameDocs,
	handleChangePasswordDocs,
	requestEmailChangeDocs,
	updateProfileDocs,
} from './profile.docs.ts';

interface ChangePasswordBody {
	currentPassword: string;
	newPassword: string;
}

interface ChangePasswordContext {
	body: ChangePasswordBody;
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}

async function handleChangePassword({ body, request, set, user }: ChangePasswordContext) {
	const authUser = assertUser(user);

	const { requireSpecialCharacter } = getAuthSettings();
	const passwordError = validatePasswordStrength(body.newPassword, {
		requireSpecialCharacter,
	});
	if (passwordError) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(passwordError, VALIDATION_ERROR_CODES.VALIDATION_WEAK_PASSWORD);
	}

	const result = await changeUserPassword(authUser.id, body.currentPassword, body.newPassword);

	if (!result.success) {
		if (result.error === SERVICE_ERRORS.USER_NOT_FOUND) {
			set.status = HTTP_STATUS.NOT_FOUND;
			return notFoundError('User');
		}
		set.status = HTTP_STATUS.BAD_REQUEST;
		if (result.error === SERVICE_ERRORS.INVALID_CREDENTIALS) {
			return badRequestError(result.error, AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
		}
		return badRequestError(result.error ?? 'Password change failed');
	}

	const config = getConfig();

	// Revoke current access token to prevent use after password change
	const cookieHeader = request.headers.get('cookie');
	if (cookieHeader) {
		const cookies = parseCookies(cookieHeader);
		const accessToken = cookies[config.security.authCookieName];
		if (accessToken) {
			const decoded = jwt.decode(accessToken) as { exp?: number } | null;
			if (decoded?.exp) {
				revokeAccessToken(accessToken, decoded.exp, authUser.id);
			}
		}
	}

	// Revoke all tokens for this user (invalidates other sessions/devices)
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	revokeAllUserTokens(authUser.id, new Date(Date.now() + refreshTtlMs));

	clearAuthCookies(set, config.security, request);

	return successResponse();
}

interface EmailChangeBody {
	currentPassword: string;
	newEmail: string;
}

interface EmailChangeContext {
	body: EmailChangeBody;
	set: { status?: number | string };
	user: AuthPayload | null;
}

async function handleEmailChangeRequest({ body, set, user }: EmailChangeContext) {
	const authUser = assertUser(user);
	const result = await requestEmailChange(authUser.id, body.currentPassword, body.newEmail);
	if (!result.success) {
		if (result.reason === SERVICE_ERRORS.INVALID_PASSWORD) {
			set.status = HTTP_STATUS.UNAUTHORIZED;
			return badRequestError(
				'Current password is incorrect',
				AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS
			);
		}
		if (result.reason === SERVICE_ERRORS.EMAIL_TAKEN) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError('Email address is already in use');
		}
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	void sendEmailWithRetry('email-change-confirm', () =>
		sendEmailChangeConfirmation(result.newEmail, result.token)
	).catch((err) => logger.error({ err }, 'email-change-confirm dispatch failed'));
	void sendEmailWithRetry('email-change-notify', () =>
		sendEmailChangeNotification(result.oldEmail, result.newEmail)
	).catch((err) => logger.error({ err }, 'email-change-notify dispatch failed'));

	return dataResponse({ pending: true });
}

const usersProfileRoutes = new Elysia({
	detail: { tags: ['Users'] },
	prefix: '/users',
})
	.use(authPlugin)
	.put(
		'/me',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			try {
				const updated = updateUser(authUser.id, {
					...(body.username !== undefined && { username: body.username }),
					updatedBy: authUser.id,
				});
				if (!updated) {
					set.status = HTTP_STATUS.NOT_FOUND;
					return notFoundError('User');
				}
				return dataResponse({
					email: updated.email,
					id: updated.id,
					role: updated.role,
					username: updated.username,
				});
			} catch (err) {
				if (isUniqueConstraintError(err)) {
					set.status = HTTP_STATUS.CONFLICT;
					return conflictError(err.message);
				}
				throw err;
			}
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				username: t.Optional(
					t.String({
						maxLength: USERNAME_MAX_LENGTH,
						minLength: USERNAME_MIN_LENGTH,
						pattern: USERNAME_PATTERN,
					})
				),
			}),
			detail: updateProfileDocs,
		}
	)
	.post('/me/email-change', handleEmailChangeRequest, {
		beforeHandle: requireAuth,
		body: t.Object({
			currentPassword: t.String({ maxLength: PASSWORD_MAX_LENGTH, minLength: 1 }),
			newEmail: t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH }),
		}),
		detail: requestEmailChangeDocs,
	})
	.put('/me/password', handleChangePassword, {
		beforeHandle: requireAuth,
		body: t.Object({
			currentPassword: t.String({ maxLength: PASSWORD_MAX_LENGTH, minLength: 1 }),
			newPassword: t.String({
				maxLength: PASSWORD_MAX_LENGTH,
				minLength: PASSWORD_MIN_LENGTH,
			}),
		}),
		detail: handleChangePasswordDocs,
	})
	.get(
		'/check-username/:username',
		({ params, set, user }) => {
			setCacheHeaders(set, 'NO_CACHE');
			const authUser = assertUser(user);
			const taken = usernameExists(params.username, authUser.id);
			return dataResponse({ available: !taken });
		},
		{
			beforeHandle: requireAuth,
			detail: checkUsernameDocs,
			params: t.Object({
				username: t.String({
					maxLength: USERNAME_MAX_LENGTH,
					minLength: USERNAME_MIN_LENGTH,
					pattern: USERNAME_PATTERN,
				}),
			}),
		}
	);

export { usersProfileRoutes };
