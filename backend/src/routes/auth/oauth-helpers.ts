import { timingSafeEqual } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import {
	CSRF_COOKIE_MAX_AGE_SECONDS,
	parseDurationMs,
	REFRESH_COOKIE_PATH,
} from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	OAUTH_CALLBACK_IP_MAX_REQUESTS,
	OAUTH_CALLBACK_IP_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { parseCookies } from '../../plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { checkRouteLimit, createRateLimitStore } from '../../plugins/rateLimit/index.ts';
import { generateOAuthBindingHash } from '../../services/oauthService.ts';
import { getUserAccountStatus, type UserAccountStatus } from '../../services/userService.ts';
import { buildCookieHeader, isSecureCookie } from '../../utils/auth/authHelpers.ts';
import {
	AUTH_ERROR_CODES,
	badRequestError,
	forbiddenError,
	type ErrorResponse,
	unauthorizedError,
} from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';

const OAUTH_BIND_COOKIE = 'oauth_bind';
const OAUTH_BIND_MAX_AGE_SECONDS = 300;

const oauthCallbackStore = createRateLimitStore();

/**
 * Validate OAuth query parameters: require code, reject provider errors.
 * Returns `{ ok: true, code, state }` if valid, or `{ ok: false, status, body }` on error.
 */
function validateOAuthQuery(
	query: { code?: string; error?: string; state?: string },
	provider: string
):
	| { body: ErrorResponse; ok: false; status: number }
	| { code: string; ok: true; state?: string | undefined } {
	if (query.error) {
		logger.warn({ error: query.error, provider }, 'OAuth provider returned error');
		return {
			body: badRequestError(
				'OAuth provider denied access',
				AUTH_ERROR_CODES.AUTH_OAUTH_FAILED
			),
			ok: false,
			status: HTTP_STATUS.BAD_REQUEST,
		};
	}

	if (!query.code) {
		return {
			body: badRequestError('Missing authorization code', AUTH_ERROR_CODES.AUTH_OAUTH_FAILED),
			ok: false,
			status: HTTP_STATUS.BAD_REQUEST,
		};
	}

	return { code: query.code, ok: true, state: query.state };
}

/**
 * Validate session binding cookie against the OAuth state parameter.
 * Returns an error result if binding fails, or null if valid.
 */
function validateSessionBinding(
	state: string,
	request: Request,
	provider: string
): { body: ErrorResponse; status: number } | null {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookies = parseCookies(cookieHeader);
	const bindValue = cookies[OAUTH_BIND_COOKIE];
	const expectedBind = generateOAuthBindingHash(state);

	if (
		!bindValue ||
		bindValue.length !== expectedBind.length ||
		!timingSafeEqual(Buffer.from(bindValue), Buffer.from(expectedBind))
	) {
		logger.warn({ provider }, 'OAuth session binding mismatch');
		return {
			body: badRequestError(
				'OAuth session binding failed',
				AUTH_ERROR_CODES.AUTH_OAUTH_FAILED
			),
			status: HTTP_STATUS.BAD_REQUEST,
		};
	}

	return null;
}

/**
 * Check the user's account status after OAuth callback.
 * Returns an error result if the account is blocked, or null if eligible.
 */
function validateAccountStatus(
	userId: number,
	provider: string
):
	| { error: { body: ErrorResponse; status: number }; user?: never }
	| { error?: never; user: UserAccountStatus } {
	const dbUser = getUserAccountStatus(userId);

	if (!dbUser || dbUser.isDeleted) {
		logger.warn({ provider, userId }, 'OAuth login blocked: account deleted');
		return {
			error: {
				body: unauthorizedError('Account has been deleted'),
				status: HTTP_STATUS.UNAUTHORIZED,
			},
		};
	}

	if (dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
		logger.warn({ provider, userId }, 'OAuth login blocked: account locked');
		return {
			error: { body: forbiddenError('Account is locked'), status: HTTP_STATUS.FORBIDDEN },
		};
	}

	// NOTE: Password expiry is intentionally NOT checked here. OAuth users authenticate
	// via the provider, not via a local password. Applying password-expiry policy to
	// OAuth logins would permanently lock out OAuth-only users. The password-expiry
	// check is enforced in the password-based login flow (login.ts) where it belongs.

	return { user: dbUser };
}

function checkOAuthCallbackRateLimit(ip: string): {
	limited: boolean;
	retryAfter?: number;
} {
	oauthCallbackStore.startCleanup();
	const result = checkRouteLimit(
		oauthCallbackStore,
		`oauth-callback-ip:${ip}`,
		OAUTH_CALLBACK_IP_MAX_REQUESTS,
		OAUTH_CALLBACK_IP_WINDOW_MS
	);
	if (result.limited) {
		return result.retryAfter !== undefined
			? { limited: true, retryAfter: result.retryAfter }
			: { limited: true };
	}
	return { limited: false };
}

/**
 * Build the Set-Cookie headers for a successful OAuth login.
 * Returns an array of cookie strings: [accessToken, refreshToken, csrf, clearBind].
 */
function buildOAuthLoginCookies(
	tokens: { accessToken: string; refreshToken: string },
	csrfToken: string,
	request: Request
): string[] {
	const config = getConfig();
	const secure = isSecureCookie(request);

	const csrfCookieFlags = [
		`Path=/`,
		`Max-Age=${CSRF_COOKIE_MAX_AGE_SECONDS}`,
		`SameSite=Strict`,
		...(secure ? ['Secure'] : []),
	].join('; ');
	const csrfCookie = `${config.security.csrfCookieName}=${csrfToken}; ${csrfCookieFlags}`;

	const clearBindCookie = `${OAUTH_BIND_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

	return [
		buildCookieHeader(
			config.security.authCookieName,
			tokens.accessToken,
			config.security.cookieMaxAge,
			request
		),
		buildCookieHeader(
			config.security.refreshCookieName,
			tokens.refreshToken,
			parseDurationMs(config.security.jwtRefreshExpiresIn, 7 * MS_PER_DAY),
			request,
			REFRESH_COOKIE_PATH
		),
		csrfCookie,
		clearBindCookie,
	];
}

/**
 * Build binding cookie header for OAuth redirect.
 */
function buildOAuthBindCookie(state: string, request: Request): string {
	const bindHash = generateOAuthBindingHash(state);
	const secure = isSecureCookie(request);
	const bindCookieFlags = [
		`Path=/`,
		`Max-Age=${OAUTH_BIND_MAX_AGE_SECONDS}`,
		`HttpOnly`,
		`SameSite=Lax`,
		...(secure ? ['Secure'] : []),
	].join('; ');
	return `${OAUTH_BIND_COOKIE}=${bindHash}; ${bindCookieFlags}`;
}

export {
	buildOAuthBindCookie,
	buildOAuthLoginCookies,
	checkOAuthCallbackRateLimit,
	generateAndStoreCsrfToken,
	validateAccountStatus,
	validateOAuthQuery,
	validateSessionBinding,
};
