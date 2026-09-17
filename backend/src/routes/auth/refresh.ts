import { Elysia } from 'elysia';
import { timingSafeEqual } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { SUCCESS_EXAMPLE } from '../../constants/responseExamples.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { authPlugin, parseCookies, signTokenPair, verifyRefreshToken } from '../../plugins/auth.ts';
import { publishResolvedUser } from '../../plugins/authRequest.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { getUserRefreshInfo } from '../../services/userService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import {
	clearAuthCookies,
	clearRefreshTokenHash,
	hashRefreshToken,
	rotateRefreshTokenHash,
	setAuthCookies,
} from '../../utils/auth/authHelpers.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
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
	set: RefreshContext['set'],
) {
	const presentedHash = hashRefreshToken(refreshToken);
	if (
		!dbUser?.refreshTokenHash ||
		dbUser.refreshTokenHash.length !== presentedHash.length ||
		!timingSafeEqual(Buffer.from(dbUser.refreshTokenHash), Buffer.from(presentedHash))
	) {
		return compromiseTokenFamily(userId, set, 'reuse');
	}
	return null;
}

function compromiseTokenFamily(
	userId: number,
	set: RefreshContext['set'],
	reason: 'reuse' | 'rotation-collision',
) {
	const config = getConfig();
	const refreshTtlMs = parseDurationMs(config.security.jwtRefreshExpiresIn, 7 * MS_PER_DAY);
	clearRefreshTokenHash(userId);
	revokeAllUserTokens(userId, new Date(Date.now() + refreshTtlMs));
	clearAuthCookies(set, config.security);
	setCacheHeaders(set, 'NO_CACHE');
	logger.warn({ reason, userId }, 'Refresh token family compromised, revoking sessions');
	set.status = HTTP_STATUS.UNAUTHORIZED;
	return unauthorizedError('Refresh token revoked', AUTH_ERROR_CODES.AUTH_TOKEN_REVOKED);
}

function handleRotationCollision(rotated: boolean, userId: number, set: RefreshContext['set']) {
	return rotated ? null : compromiseTokenFamily(userId, set, 'rotation-collision');
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
	// authenticated before the lock began. Checking lockout here would let a known-username
	// attacker terminate a victim's active sessions by deliberately tripping the lock with bad
	// passwords. Sessions are still revoked through the legitimate channels:
	// refresh-token reuse detection, account deletion, and password change (which rotates the
	// refresh-token hash).

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
		tokens.refreshToken,
	);
	const collisionError = handleRotationCollision(rotated, payload.id, set);
	if (collisionError) return collisionError;

	setAuthCookies(set, config.security, tokens);

	// Publish the identity for the audit plugin: the auth cookie goes out on the
	// RESPONSE, so onAfterResponse has nothing on the request to resolve.
	publishResolvedUser(request, payload);

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
				'tokens and updates cookies. Implements refresh-token rotation - reuse of a ' +
				'previously rotated token revokes all sessions for user (AUTH_TOKEN_REVOKED). ' +
				'An ambiguous concurrent rotation is treated as the same non-retryable compromise. ' +
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
					description: 'Tokens rotated - new cookies set.',
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
			},
			summary: 'Refresh access token using refresh cookie',
		},
	});

export { authRefreshRoutes, handleRotationCollision };
