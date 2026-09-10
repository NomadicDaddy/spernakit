import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
	AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import { getAuthSettings, isAuthRateLimitInEffect } from '../../services/authService.ts';
import { type RateLimitCheckResult } from '../../services/rateLimitService.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { RATE_ERROR_CODES, rateLimitError } from '../../utils/errorResponse.ts';
import { PreValidationRejection } from '../../utils/preValidationRejection.ts';
import { checkLimit, type RateLimitBackend } from './helpers.ts';
import { createRateLimitStore } from './store.ts';

const authStore = createRateLimitStore();

/** HTTP methods that should be excluded from auth rate limiting (safe/idempotent). */
const AUTH_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Auth login paths that include an account identifier in the request body. */
const AUTH_ACCOUNT_PATHS = new Set(['/api/v1/auth/forgot-password', '/api/v1/auth/login']);

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
		const url = new URL(request.url);

		if (!url.pathname.startsWith('/api/v1/auth/')) return;
		if (AUTH_SAFE_METHODS.has(request.method)) return;

		// The SYSOP-editable setting and the pre-boot config kill-switch both have to be on, and
		// `isAuthRateLimitInEffect` is what decides that. Settings > Authentication asks the same
		// function, so what the page reports and what this plugin does cannot disagree.
		const authSettings = getAuthSettings();
		if (!isAuthRateLimitInEffect(authSettings)) return;

		authStore.startCleanup();

		const ip = getClientIp(request);
		const backend = config.rateLimit.backend as RateLimitBackend;
		const authMaxRequests = authSettings.authRateLimitMaxRequests;
		const authWindowMs = authSettings.authRateLimitWindowMinutes * 60 * 1000;

		// IP-based rate limit
		const ipResult = checkLimit(
			backend,
			authStore,
			`auth:${ip}`,
			authMaxRequests,
			authWindowMs,
		);

		if (ipResult.limited) {
			throw rejectAsLimited(ipResult.retryAfter);
		}

		set.headers['X-RateLimit-Limit'] = String(authMaxRequests);
		set.headers['X-RateLimit-Remaining'] = String(
			Math.max(0, authMaxRequests - ipResult.count),
		);
		set.headers['X-RateLimit-Reset'] = String(Math.ceil(ipResult.resetAt.getTime() / 1000));

		// Account-level rate limit for login/password-reset
		if (AUTH_ACCOUNT_PATHS.has(url.pathname)) {
			const accountResult = await checkAccountRateLimit(request, backend);
			if (accountResult) {
				throw rejectAsLimited(accountResult.retryAfter);
			}
		}

		return undefined;
	},
);

export { authRateLimitPlugin, authStore };
