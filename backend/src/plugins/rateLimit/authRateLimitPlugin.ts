import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
	AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import { getAuthSettings } from '../../services/authService.ts';
import { type RateLimitCheckResult } from '../../services/rateLimitService.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { RATE_ERROR_CODES, rateLimitError } from '../../utils/errorResponse.ts';
import { checkLimit, isAuthRateLimitBypassed, type RateLimitBackend } from './helpers.ts';
import { createRateLimitStore } from './store.ts';

const authStore = createRateLimitStore();

/** HTTP methods that should be excluded from auth rate limiting (safe/idempotent). */
const AUTH_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Auth login paths that include an account identifier in the request body. */
const AUTH_ACCOUNT_PATHS = new Set(['/api/v1/auth/login', '/api/v1/auth/forgot-password']);

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
	backend: RateLimitBackend
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
			AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS
		);
		return result.limited ? result : null;
	} catch {
		// Body parse failure — IP limit still applies
		return null;
	}
}

const authRateLimitPlugin = new Elysia({ name: 'auth-rate-limit' }).onBeforeHandle(
	{ as: 'scoped' },
	async ({ request, set }) => {
		const config = getConfig();
		const url = new URL(request.url);

		if (!url.pathname.startsWith('/api/v1/auth/')) return undefined;
		if (AUTH_SAFE_METHODS.has(request.method)) return undefined;
		if (isAuthRateLimitBypassed()) return undefined;

		// Honor SYSOP-controlled auth rate limit settings. The `authSettings` store is the
		// editable source of truth; fall back to `config.rateLimit.authEnabled` so admins
		// can still kill-switch auth limits via config.spernakit.json pre-boot.
		const authSettings = getAuthSettings();
		if (!authSettings.authRateLimitEnabled || !config.rateLimit.authEnabled) {
			return undefined;
		}

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
			authWindowMs
		);

		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter || 0);
			return rateLimitError(
				ipResult.retryAfter || 0,
				RATE_ERROR_CODES.RATE_LOGIN_LIMIT_EXCEEDED
			);
		}

		set.headers['X-RateLimit-Limit'] = String(authMaxRequests);
		set.headers['X-RateLimit-Remaining'] = String(
			Math.max(0, authMaxRequests - ipResult.count)
		);
		set.headers['X-RateLimit-Reset'] = String(Math.ceil(ipResult.resetAt.getTime() / 1000));

		// Account-level rate limit for login/password-reset
		if (AUTH_ACCOUNT_PATHS.has(url.pathname)) {
			const accountResult = await checkAccountRateLimit(request, backend);
			if (accountResult) {
				set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
				set.headers['Retry-After'] = String(accountResult.retryAfter || 0);
				return rateLimitError(
					accountResult.retryAfter || 0,
					RATE_ERROR_CODES.RATE_LOGIN_LIMIT_EXCEEDED
				);
			}
		}

		return undefined;
	}
);

export { authRateLimitPlugin, authStore };
