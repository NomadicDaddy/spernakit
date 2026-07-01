import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './scheduler.ts';

/**
 * Path scope for the refresh token cookie.
 * Restricts cookie transmission to the refresh endpoint only, reducing attack surface.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

/**
 * Max-Age in seconds for the CSRF delivery cookie set during OAuth callback.
 * Short-lived so the frontend can read the token then the cookie expires.
 */
const CSRF_COOKIE_MAX_AGE_SECONDS = 30;

/**
 * Parse a duration string (e.g. '7d', '24h', '30m', '60s') into milliseconds.
 * Falls back to the provided default if the string is not a recognized format.
 *
 * @param duration - Duration string with unit suffix (d, h, m, s)
 * @param fallbackMs - Fallback value in milliseconds
 * @returns Duration in milliseconds
 */
function parseDurationMs(duration: string, fallbackMs: number): number {
	const match = /^(\d+)([dhms])$/.exec(duration);
	if (!match) return fallbackMs;

	const value = Number(match[1]);
	switch (match[2]) {
		case 'd':
			return value * MS_PER_DAY;
		case 'h':
			return value * MS_PER_HOUR;
		case 'm':
			return value * MS_PER_MINUTE;
		case 's':
			return value * 1000;
		default:
			return fallbackMs;
	}
}

/**
 * Convert a rate-limit resetAt timestamp to a Retry-After header value in seconds.
 * @param resetAt - The timestamp when the rate limit window resets
 * @param now - The current timestamp
 * @returns Seconds until the rate limit resets, rounded up
 */
function msToRetryAfterSeconds(resetAt: number, now: number): number {
	return Math.ceil((resetAt - now) / 1000);
}

/**
 * Default TTL for refresh tokens: 7 days in milliseconds.
 * Used as the fallback when parsing `jwtRefreshExpiresIn` from config.
 */
const DEFAULT_REFRESH_TTL_MS = 7 * MS_PER_DAY;

export {
	CSRF_COOKIE_MAX_AGE_SECONDS,
	DEFAULT_REFRESH_TTL_MS,
	msToRetryAfterSeconds,
	parseDurationMs,
	REFRESH_COOKIE_PATH,
};
