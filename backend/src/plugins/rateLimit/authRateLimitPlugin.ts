import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
	AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS,
	AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS,
	AUTH_SESSION_RATE_LIMIT_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import { getAuthSettings, isAuthRateLimitInEffect } from '../../services/authService.ts';
import { type RateLimitCheckResult } from '../../services/rateLimitService.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { RATE_ERROR_CODES, rateLimitError } from '../../utils/errorResponse.ts';
import { PreValidationRejection } from '../../utils/preValidationRejection.ts';
import { parseCookies, verifyAccessToken, verifyRefreshToken } from '../authTokens.ts';
import { checkLimit, type RateLimitBackend } from './helpers.ts';
import { createRateLimitStore } from './store.ts';

const authStore = createRateLimitStore();

/** HTTP methods that should be excluded from auth rate limiting (safe/idempotent). */
const AUTH_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Auth login paths that include an account identifier in the request body. */
const AUTH_ACCOUNT_PATHS = new Set(['/api/v1/auth/forgot-password', '/api/v1/auth/login']);

/**
 * Requests that keep an existing sign-in going rather than create one, and the cookie each one
 * proves its sign-in with: refresh carries the refresh cookie (path-scoped to that route), logout
 * the access cookie. They have buckets of their own: sharing the per-IP login bucket let a burst
 * of failed logins from one address answer every session behind it 429 on refresh, which the
 * browser treats as a signed-out session.
 */
const AUTH_SESSION_ROUTES: Record<string, { cookie: 'access' | 'refresh'; name: string }> = {
	'/api/v1/auth/logout': { cookie: 'access', name: 'logout' },
	'/api/v1/auth/refresh': { cookie: 'refresh', name: 'refresh' },
};

interface AuthBucket {
	key: string;
	max: number;
	windowMs: number;
}

/**
 * The path the router will match. Elysia accepts a trailing slash (strictPath is off), so the
 * limiter compares paths without one; otherwise `/auth/login/` would skip the account limit and
 * `/auth/refresh/` would land in the login bucket.
 *
 * @param pathname - The request's URL path
 * @returns The path without trailing slashes
 */
function routedPath(pathname: string): string {
	return pathname.replace(/\/+$/, '');
}

/**
 * The verified sign-in a session request belongs to: its refresh family when the token names one,
 * else its user. Keying by the family means a leaked or ended-but-unexpired token spends only its
 * own sign-in's budget, never the user's other browsers'.
 *
 * @param request - The incoming request
 * @param cookie - Which cookie this route proves its sign-in with
 * @returns The bucket identity, or null when no token verifies
 */
function sessionIdentity(request: Request, cookie: 'access' | 'refresh'): null | string {
	const header = request.headers.get('cookie');
	if (!header) return null;
	const security = getConfig().security;
	const token =
		parseCookies(header)[
			cookie === 'access' ? security.authCookieName : security.refreshCookieName
		];
	if (!token) return null;
	const payload = cookie === 'access' ? verifyAccessToken(token) : verifyRefreshToken(token);
	if (!payload) return null;
	return payload.sid ? `sid:${payload.sid}` : `user:${String(payload.id)}`;
}

/**
 * The bucket an auth request counts against. A session request is keyed by its verified sign-in,
 * so nobody can spend another user's budget by naming them; without a valid token it falls back
 * to that route's own per-IP bucket. Every other auth request counts against the per-IP login
 * bucket the SYSOP settings size.
 *
 * @param request - The incoming request
 * @param pathname - Its routed path
 * @param settings - The current auth rate-limit settings
 * @returns The bucket key and its limit
 */
function bucketFor(
	request: Request,
	pathname: string,
	settings: ReturnType<typeof getAuthSettings>,
): AuthBucket {
	const ip = getClientIp(request);
	const session = AUTH_SESSION_ROUTES[pathname];
	if (!session) {
		return {
			key: `auth:${ip}`,
			max: settings.authRateLimitMaxRequests,
			windowMs: settings.authRateLimitWindowMinutes * 60 * 1000,
		};
	}
	const identity = sessionIdentity(request, session.cookie);
	return {
		key: `auth:session:${session.name}:${identity ?? `ip:${ip}`}`,
		max: AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS,
		windowMs: AUTH_SESSION_RATE_LIMIT_WINDOW_MS,
	};
}

/**
 * Check account-level rate limit for login/password-reset to prevent distributed brute-force.
 * Extracts the account identifier from the request body and checks the limit.
 *
 * @param request - The incoming request
 * @param backend - The rate limit backend to use
 * @returns A rate limit check result if the account is limited, null otherwise
 */
async function checkAccountRateLimit(
	request: Request,
	backend: RateLimitBackend,
): Promise<null | RateLimitCheckResult> {
	try {
		const cloned = request.clone();
		const body = (await cloned.json()) as {
			email?: string;
			username?: string;
			usernameOrEmail?: string;
		};
		const account = (body.username ?? body.usernameOrEmail ?? body.email ?? '')
			.toLowerCase()
			.trim();
		if (!account) return null;

		const result = checkLimit(
			backend,
			authStore,
			`auth:account:${account}`,
			AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
			AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS,
		);
		return result.limited ? result : null;
	} catch {
		// Body parse failure — IP limit still applies
		return null;
	}
}

/**
 * The rejection a limited auth request is answered with.
 *
 * Built once because the IP limit and the account limit answer identically, and raised rather than
 * returned because a transform hook cannot stop a request by returning.
 *
 * @param retryAfter - Seconds until the caller may try again, as the limiter reported it.
 * @returns The rejection to throw.
 */
function rejectAsLimited(retryAfter: number | undefined): PreValidationRejection {
	const seconds = retryAfter ?? 0;
	return new PreValidationRejection(
		HTTP_STATUS.TOO_MANY_REQUESTS,
		rateLimitError(seconds, RATE_ERROR_CODES.RATE_LOGIN_LIMIT_EXCEEDED),
		{ 'Retry-After': String(seconds) },
	);
}
/**
 * Rate limiter for the authentication routes.
 *
 * Runs at the transform stage, the same stage the global limiter and the authorization guards run
 * at, and the stage before Elysia validates the request against the route's schema. While this sat
 * in `beforeHandle` a login attempt carrying a body the schema rejected was answered 400 by
 * validation and never counted, so an attacker could send an unlimited number of malformed login
 * attempts without ever consuming the budget the limiter exists to enforce. The account-level check
 * reads the body itself, from a clone, which is what lets it run this early.
 *
 * A transform hook cannot short-circuit by returning a value, so a limited request is raised as a
 * PreValidationRejection carrying its own Retry-After header; create-api-app.ts's onError returns
 * it unchanged.
 */
const authRateLimitPlugin = new Elysia({ name: 'auth-rate-limit' }).onTransform(
	{ as: 'scoped' },
	async ({ request, set }) => {
		const config = getConfig();
		const pathname = routedPath(new URL(request.url).pathname);

		if (!pathname.startsWith('/api/v1/auth/')) return;
		if (AUTH_SAFE_METHODS.has(request.method)) return;

		// The SYSOP-editable setting and the pre-boot config kill-switch both have to be on, and
		// `isAuthRateLimitInEffect` is what decides that. Settings > Authentication asks the same
		// function, so what the page reports and what this plugin does cannot disagree.
		const authSettings = getAuthSettings();
		if (!isAuthRateLimitInEffect(authSettings)) return;

		authStore.startCleanup();

		const backend = config.rateLimit.backend as RateLimitBackend;
		const limit = bucketFor(request, pathname, authSettings);
		const ipResult = checkLimit(backend, authStore, limit.key, limit.max, limit.windowMs);

		if (ipResult.limited) {
			throw rejectAsLimited(ipResult.retryAfter);
		}

		set.headers['X-RateLimit-Limit'] = String(limit.max);
		set.headers['X-RateLimit-Remaining'] = String(Math.max(0, limit.max - ipResult.count));
		set.headers['X-RateLimit-Reset'] = String(Math.ceil(ipResult.resetAt.getTime() / 1000));

		// Account-level rate limit for login/password-reset
		if (AUTH_ACCOUNT_PATHS.has(pathname)) {
			const accountResult = await checkAccountRateLimit(request, backend);
			if (accountResult) {
				throw rejectAsLimited(accountResult.retryAfter);
			}
		}

		return undefined;
	},
);

export { authRateLimitPlugin, authStore };
