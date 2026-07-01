import type { RateLimitStore } from './store.ts';

import { getConfig } from '../../config/configLoader.ts';
import { resolveUserFromCookie } from '../../plugins/auth.ts';
import { checkRateLimit, type RateLimitCheckResult } from '../../services/rateLimitService.ts';
import { getClientIp } from '../../utils/clientIp.ts';

type RateLimitBackend = 'database' | 'memory';

/**
 * Get the single rate limit key for a request.
 * Authenticated users are keyed by user ID; unauthenticated by IP address.
 * Returns a single key to avoid double-counting requests against both an IP
 * bucket and a user bucket simultaneously.
 */
function getRateLimitKeys(request: Request): string[] {
	const user = resolveUserFromCookie(request);
	if (user) {
		return [`user:${user.id}`];
	}
	return [`ip:${getClientIp(request)}`];
}

function checkLimit(
	backend: RateLimitBackend,
	store: RateLimitStore,
	key: string,
	maxRequests: number,
	windowMs: number
): RateLimitCheckResult {
	if (backend === 'database') {
		return checkRateLimit(key, maxRequests, windowMs);
	}
	return store.check(key, maxRequests, windowMs);
}

function checkRouteLimit(
	store: RateLimitStore,
	key: string,
	maxRequests: number,
	windowMs: number
): RateLimitCheckResult {
	const backend = getConfig().rateLimit.backend as RateLimitBackend;
	return checkLimit(backend, store, key, maxRequests, windowMs);
}

/** Returns true when rate limiting should be skipped (disabled via config). */
function isRateLimitBypassed(): boolean {
	const config = getConfig();
	return !config.rateLimit.enabled;
}

/**
 * Returns true when auth-endpoint rate limiting should be skipped (disabled via config).
 * Independent of the general `rateLimit.enabled` flag so production can keep auth limits
 * enabled even if a deployment opts out of general request throttling, and dev can
 * disable auth limits to avoid lockouts during scripted multi-role test runs.
 */
function isAuthRateLimitBypassed(): boolean {
	const config = getConfig();
	return !config.rateLimit.authEnabled;
}

export {
	checkLimit,
	checkRouteLimit,
	getRateLimitKeys,
	isAuthRateLimitBypassed,
	isRateLimitBypassed,
};
export type { RateLimitBackend };
