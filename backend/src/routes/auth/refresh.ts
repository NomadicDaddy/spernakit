import { Elysia } from 'elysia';
import { timingSafeEqual } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { SUCCESS_EXAMPLE } from '../../constants/responseExamples.ts';
import { authPlugin, parseCookies, signTokenPair, verifyRefreshToken } from '../../plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { getUserRefreshInfo } from '../../services/userService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import {
	clearRefreshTokenHash,
	hashRefreshToken,
	rotateRefreshTokenHash,
	setAuthCookies,
} from '../../utils/auth/authHelpers.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { AUTH_ERROR_CODES, unauthorizedError } from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';

interface RefreshContext {
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

function extractRefreshToken(request: Request): string | undefined {
	const config = getConfig();
	const cookieHeader = request.headers.get('cookie');

	if (!cookieHeader) {
		return undefined;
	}

	const cookies = parseCookies(cookieHeader);
	return cookies[config.security.refreshCookieName];
}

function validateRefreshTokenReuse(
	dbUser: ReturnType<typeof getUserRefreshInfo>,
	refreshToken: string,
	userId: number,
	set: RefreshContext['set']
) {
	const presentedHash = hashRefreshToken(refreshToken);
	if (
		!dbUser?.refreshTokenHash ||
		dbUser.refreshTokenHash.length !== presentedHash.length ||
		!timingSafeEqual(Buffer.from(dbUser.refreshTokenHash), Buffer.from(presentedHash))
	) {
		clearRefreshTokenHash(userId);
		logger.warn({ userId }, 'Refresh token reuse detected, revoking tokens');
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('Refresh token revoked', AUTH_ERROR_CODES.AUTH_TOKEN_REVOKED);
	}
	return null;
}

async function handleTokenRefresh({ request, set }: RefreshContext) {
	const refreshToken = extractRefreshToken(request);
	if (!refreshToken) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('No refresh token', AUTH_ERROR_CODES.AUTH_TOKEN_MISSING);
	}

	const payload = verifyRefreshToken(refreshToken);
	if (!payload) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('Invalid refresh token', AUTH_ERROR_CODES.AUTH_TOKEN_INVALID);
	}

	const dbUser = getUserRefreshInfo(payload.id);
	if (dbUser?.isDeleted) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('Account has been deleted', AUTH_ERROR_CODES.AUTH_ACCOUNT_DELETED);
	}

	if (!dbUser) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('User not found', AUTH_ERROR_CODES.AUTH_TOKEN_INVALID);
	}

	// NOTE: Account lockout is intentionally NOT checked during token refresh.
	// Lockout (failedLoginAttempts >= maxLoginAttempts) is a *password-login* defense: it must
	// gate new credential-based logins, but it must NOT revoke sessions that were already
	// authenticated before the lock began. Refusing refresh on lockout let a known-username
	// attacker terminate a victim's active sessions by deliberately tripping the lock with bad
	// passwords — a targeted DoS. Sessions are still revoked through the legitimate channels:
	// refresh-token reuse detection, account deletion, and password change (which rotates the
	// refresh-token hash). See remediation-20260611-lockout-dos-threshold.

	// NOTE: Password expiry is intentionally NOT checked during token refresh.
	// Blocking refresh when password is expired creates a lockout: the user's access token
	// has expired, and rejecting refresh prevents them from obtaining a new token to reach
	// the password-change endpoint. The passwordChangeGuard plugin handles restricting
	// expired-password users to only the password-change endpoint.

	const reuseError = validateRefreshTokenReuse(dbUser, refreshToken, payload.id, set);
	if (reuseError) return reuseError;

	const config = getConfig();
	const tokens = signTokenPair({
		id: payload.id,
		role: dbUser.role,
	});

	// Atomic rotation: only succeeds if the hash hasn't changed since we read it.
	// Prevents race condition where concurrent refreshes from multiple tabs
	// could each pass validation but overwrite each other's new tokens.
	const rotated = rotateRefreshTokenHash(
		payload.id,
		dbUser.refreshTokenHash!,
		tokens.refreshToken
	);
	if (!rotated) {
		set.status = HTTP_STATUS.CONFLICT;
		return {
			code: AUTH_ERROR_CODES.AUTH_TOKEN_INVALID,
			error: 'Conflict',
			message: 'Concurrent refresh detected, please retry',
		};
	}

	setAuthCookies(set, config.security, tokens, request);

	const csrfToken = await generateAndStoreCsrfToken(payload.id);
	set.headers['X-CSRF-Token'] = csrfToken;
	setCacheHeaders(set, 'NO_CACHE');

	return successResponse();
}

const authRefreshRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.post('/refresh', handleTokenRefresh, {
		detail: {
			description:
				'Rotates access/refresh token pair using refresh cookie. Issues new ' +
				'tokens and updates cookies. Implements refresh-token rotation — reuse of a ' +
				'previously rotated token revokes all sessions for user (AUTH_TOKEN_REVOKED). ' +
				'Also returns AUTH_ACCOUNT_DELETED if account was removed. Account lockout from ' +
				'failed password logins is intentionally NOT enforced here, so an attacker cannot ' +
				"kill a victim's active session by tripping the lock.",
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Tokens rotated — new cookies set.',
				},
				'401': {
					content: {
						'application/json': {
							examples: {
								accountDeleted: {
									summary: 'User account has been deleted',
									value: {
										code: 'AUTH_ACCOUNT_DELETED',
										error: 'Unauthorized',
										message: 'Account has been deleted',
									},
								},
								tokenMissing: {
									summary: 'No refresh cookie present',
									value: {
										code: 'AUTH_TOKEN_MISSING',
										error: 'Unauthorized',
										message: 'No refresh token',
									},
								},
								tokenRevoked: {
									summary: 'Reuse of rotated refresh token detected',
									value: {
										code: 'AUTH_TOKEN_REVOKED',
										error: 'Unauthorized',
										message: 'Refresh token revoked',
									},
								},
							},
						},
					},
					description: 'Refresh token missing, invalid, revoked, or account deleted.',
				},
				'409': {
					content: {
						'application/json': {
							examples: {
								concurrentRefresh: {
									summary: 'Concurrent refresh from another tab/device',
									value: {
										code: 'AUTH_TOKEN_INVALID',
										error: 'Conflict',
										message: 'Concurrent refresh detected, please retry',
									},
								},
							},
						},
					},
					description: 'Concurrent refresh detected — retry the request.',
				},
			},
			summary: 'Refresh access token using refresh cookie',
		},
	});

export { authRefreshRoutes };
