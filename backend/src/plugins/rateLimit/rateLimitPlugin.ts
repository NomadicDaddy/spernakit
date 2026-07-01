import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { RATE_ERROR_CODES, rateLimitError } from '../../utils/errorResponse.ts';
import {
	checkLimit,
	getRateLimitKeys,
	isRateLimitBypassed,
	type RateLimitBackend,
} from './helpers.ts';
import { createRateLimitStore } from './store.ts';

const apiStore = createRateLimitStore();

/**
 * Paths that should never count toward the global API rate limit.
 *
 * - /health, /docs: infrastructure endpoints
 * - /auth/me: polled on every navigation by the SPA; rate-limiting it causes
 *   false session-expiry redirects under normal use
 * - /auth/login, /auth/refresh: auth mutation endpoints are already covered by
 *   the authRateLimitPlugin with tighter per-endpoint limits; exempting them from
 *   the global limiter prevents lockouts where a user cannot even log back in
 * - /dashboards/shared/: unauthenticated shared dashboard view has its own
 *   dedicated per-route limiter (30 req/60s per IP); counting it against the
 *   global budget causes a 429 retry cascade that locks out all endpoints
 *
 * Policy: do NOT edit this list without reading and (if needed) amending
 * docs/template/adr/adr-009-rate-limit-policy.md. Every exempt endpoint must
 * have stated protection (dedicated limiter or safe method).
 */
const RATE_LIMIT_EXEMPT_PREFIXES = [
	'/api/v1/health',
	'/api/v1/docs',
	'/api/v1/auth/me',
	'/api/v1/auth/login',
	'/api/v1/auth/refresh',
	'/api/v1/dashboards/shared/',
];

const rateLimitPlugin = new Elysia({ name: 'rate-limit' }).onBeforeHandle(
	{ as: 'scoped' },
	({ request, set }) => {
		if (isRateLimitBypassed()) return;

		const pathname = new URL(request.url).pathname;
		if (RATE_LIMIT_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;

		const config = getConfig();
		const { backend, maxRequests, windowMs } = config.rateLimit;

		// In-memory cleanup only; DB cleanup runs via scheduled task (rate-limit-cleanup)
		apiStore.startCleanup();

		const keys = getRateLimitKeys(request);
		for (const key of keys) {
			const result = checkLimit(
				backend as RateLimitBackend,
				apiStore,
				key,
				maxRequests,
				windowMs
			);

			if (result.limited) {
				set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
				set.headers['Retry-After'] = String(result.retryAfter || 0);
				return rateLimitError(
					result.retryAfter || 0,
					RATE_ERROR_CODES.RATE_API_LIMIT_EXCEEDED
				);
			}

			set.headers['X-RateLimit-Limit'] = String(maxRequests);
			set.headers['X-RateLimit-Remaining'] = String(Math.max(0, maxRequests - result.count));
			set.headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetAt.getTime() / 1000));
		}

		return undefined;
	}
);

export { apiStore, rateLimitPlugin };
