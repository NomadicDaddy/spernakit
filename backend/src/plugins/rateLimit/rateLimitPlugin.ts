import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	PreValidationRejection,
	RATE_ERROR_CODES,
	rateLimitError,
} from '../../utils/errorResponse.ts';
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

/**
 * Global API rate limiter.
 *
 * Runs at the transform stage rather than in `beforeHandle` so that it stays ahead of the
 * authorization checks the auth plugin's `requireAuth` and `requireRole` options now perform, which
 * also run there. Both had to move together: leaving the limiter in `beforeHandle` would have let
 * an anonymous flood of a protected route be answered 401 without ever being counted. The earlier
 * position closes a second hole that predates that change, where a request carrying a body the
 * route's schema rejected was answered 400 by validation and never counted either.
 *
 * A transform hook cannot short-circuit by returning a value, so a limited request is raised as a
 * PreValidationRejection carrying its own Retry-After header; create-api-app.ts's onError returns
 * it unchanged. The unlimited path still sets its X-RateLimit-* headers directly on `set`.
 */
const rateLimitPlugin = new Elysia({ name: 'rate-limit' }).onTransform(
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
				windowMs,
			);

			if (result.limited) {
				const retryAfter = result.retryAfter || 0;
				throw new PreValidationRejection(
					HTTP_STATUS.TOO_MANY_REQUESTS,
					rateLimitError(retryAfter, RATE_ERROR_CODES.RATE_API_LIMIT_EXCEEDED),
					{ 'Retry-After': String(retryAfter) },
				);
			}

			set.headers['X-RateLimit-Limit'] = String(maxRequests);
			set.headers['X-RateLimit-Remaining'] = String(Math.max(0, maxRequests - result.count));
			set.headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetAt.getTime() / 1000));
		}

		return undefined;
	},
);

export { apiStore, rateLimitPlugin };
