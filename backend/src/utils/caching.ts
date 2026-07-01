/**
 * HTTP Cache-Control header utilities for API responses.
 *
 * Cache Strategies:
 * - NO_CACHE: For auth, mutations, and user-specific real-time data
 * - SHORT: 30 seconds - frequently changing data (notifications, dashboard stats)
 * - MEDIUM: 5 minutes - user profiles, workspace info
 * - LONG: 1 hour - static settings, rarely changing config
 * - STATIC: 1 day - truly static resources
 *
 * All cached responses are marked private (not CDN cacheable) since most data
 * is user-specific. Use 'public' only for truly public, non-user-specific data.
 */

/** Cache duration constants in seconds */
const CACHE_DURATIONS = {
	/** 1 hour - rarely changing data */
	LONG: 3600,

	/** 5 minutes - moderately stable data */
	MEDIUM: 300,

	/** No caching - for mutations and sensitive data */
	NO_CACHE: 0,

	/** 30 seconds - frequently changing data */
	SHORT: 30,
	/** 1 day - static resources */
	STATIC: 86400,
} as const;

type CacheDuration = keyof typeof CACHE_DURATIONS;

/**
 * Sets appropriate Cache-Control headers on the response.
 *
 * @param set - Elysia's set object containing headers
 * @param set.headers
 * @param duration - Cache duration level
 * @param options - Additional options
 * @param options.isPublic - If true, allows CDN caching (default: false, private)
 * @param options.mustRevalidate - If true, forces revalidation after max-age (default: false)
 *
 * @example
 * // No cache for mutations
 * setCacheHeaders(set, 'NO_CACHE');
 *
 * @example
 * // Short cache for dashboard
 * setCacheHeaders(set, 'SHORT');
 *
 * @example
 * // Public cache for static config (CDN cacheable)
 * setCacheHeaders(set, 'LONG', { isPublic: true });
 */
function setCacheHeaders(
	set: { headers: Record<string, number | string> },
	duration: CacheDuration,
	options: { isPublic?: boolean; mustRevalidate?: boolean } = {}
): void {
	const { isPublic = false, mustRevalidate = false } = options;
	const seconds = CACHE_DURATIONS[duration];

	if (duration === 'NO_CACHE') {
		// Prevent any caching
		set.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
		set.headers['Pragma'] = 'no-cache';
		return;
	}

	// Build Cache-Control directive
	const directives: string[] = [isPublic ? 'public' : 'private', `max-age=${seconds}`];

	if (mustRevalidate) {
		directives.push('must-revalidate');
	}

	set.headers['Cache-Control'] = directives.join(', ');
}

export { setCacheHeaders };
