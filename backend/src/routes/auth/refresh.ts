import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { SUCCESS_EXAMPLE } from '../../constants/responseExamples.ts';
import { authPlugin, parseCookies, signTokenPair, verifyRefreshToken } from '../../plugins/auth.ts';
import { publishResolvedUser } from '../../plugins/authRequest.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { getUserRefreshInfo } from '../../services/userService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { clearAuthCookies, setAuthCookies } from '../../utils/auth/authHelpers.ts';
import {
	endRefreshFamily,
	findRefreshSession,
	refreshExpiry,
	type RefreshSessionRow,
	rotateRefreshSession,
} from '../../utils/auth/refreshSessions.ts';
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

/**
 * Answer a refresh token the server holds no live row for: one from a sign-in that already ended
 * (logout, password change, an earlier compromise) or that expired. Nothing is revoked, because a
 * dead token proves nothing about the user's other sign-ins.
 */
function rejectUnknownRefreshToken(set: RefreshContext['set']) {
	clearAuthCookies(set, getConfig().security);
	setCacheHeaders(set, 'NO_CACHE');
	set.status = HTTP_STATUS.UNAUTHORIZED;
	return unauthorizedError('Refresh token not recognised', AUTH_ERROR_CODES.AUTH_TOKEN_INVALID);
}

/**
 * A rotated token was presented again, or two requests raced to rotate the same one: somebody else
 * holds this sign-in's token. End the sign-in the token belongs to and nothing else.
 *
 * Access tokens are not checked against their family on every request, so the family's access
 * tokens are ended with the account-wide revocation. The user's other sign-ins keep their refresh
 * tokens and recover with one silent refresh.
 */
function compromiseTokenFamily(
	row: RefreshSessionRow,
	set: RefreshContext['set'],
	reason: 'reuse' | 'rotation-collision',
) {
	endRefreshFamily(row.familyId);
	revokeAllUserTokens(row.userId, refreshExpiry());
	clearAuthCookies(set, getConfig().security);
	setCacheHeaders(set, 'NO_CACHE');
	logger.warn(
		{ reason, userId: row.userId },
		'Refresh token family compromised, ending that sign-in',
	);
	set.status = HTTP_STATUS.UNAUTHORIZED;
	return unauthorizedError('Refresh token revoked', AUTH_ERROR_CODES.AUTH_TOKEN_REVOKED);
}

function handleRotationCollision(
	rotated: boolean,
	row: RefreshSessionRow,
	set: RefreshContext['set'],
) {
	return rotated ? null : compromiseTokenFamily(row, set, 'rotation-collision');
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
	// refresh-token reuse detection, account deletion, and password change (which ends every
	// refresh-token family the user has).

	// NOTE: Password expiry is intentionally NOT checked during token refresh.
	// Blocking refresh when password is expired creates a lockout: the user's access token
	// has expired, and rejecting refresh prevents them from obtaining a new token to reach
	// the password-change endpoint. The passwordChangeGuard plugin handles restricting
	// expired-password users to only the password-change endpoint.

	const row = findRefreshSession(refreshToken);
	if (
		!row ||
		row.userId !== payload.id ||
		row.familyId !== payload.sid ||
		row.expiresAt <= new Date()
	) {
		return rejectUnknownRefreshToken(set);
	}
	if (row.rotatedAt) return compromiseTokenFamily(row, set, 'reuse');

	const config = getConfig();
	const tokens = signTokenPair({
		id: payload.id,
		role: dbUser.role,
		sid: row.familyId,
	});

	// Atomic rotation: only one of two concurrent refreshes with the same token can claim it.
	// The browser serialises its own tabs' refreshes, so losing that race means a second holder.
	const rotated = rotateRefreshSession(row, tokens.refreshToken);
	const collisionError = handleRotationCollision(rotated, row, set);
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
				'tokens and updates cookies. Each sign-in is its own refresh-token family, so a ' +
				'user may be signed in on several browsers at once. Reuse of a previously rotated ' +
				'token ends that sign-in only (AUTH_TOKEN_REVOKED); a token from a sign-in that ' +
				'already ended is AUTH_TOKEN_INVALID. An ambiguous concurrent rotation is treated ' +
				'as the same non-retryable compromise. ' +
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
								tokenInvalid: {
									summary: 'Refresh token from a sign-in that already ended',
									value: {
										code: 'AUTH_TOKEN_INVALID',
										error: 'Unauthorized',
										message: 'Refresh token not recognised',
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
