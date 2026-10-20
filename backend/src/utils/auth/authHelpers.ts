import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { parseDurationMs, REFRESH_COOKIE_PATH } from '../../constants/auth.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';

/**
 * Hash a refresh token using HMAC-SHA256 keyed with the server encryption key.
 * Provides defense-in-depth: if the database is compromised, the attacker
 * cannot forge token hashes without the HMAC key.
 * @param token - The refresh token to hash
 * @returns HMAC-SHA256 hash as hexadecimal string
 */
export function hashRefreshToken(token: string): string {
	const key = getConfig().security.encryptionKey;
	return createHmac('sha256', key).update(token).digest('hex');
}

/**
 * Clear the user's CSRF signing secret, for admin actions that end every session the user has.
 * A single logout must not call this: the secret is shared by all of the user's sign-ins.
 * @param userId - The user ID to clear the CSRF token for
 */
export function clearCsrfToken(userId: number): void {
	const db = getDb();
	db.update(users)
		.set({ csrfToken: null, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.run();
}

/**
 * Determine whether cookies should have the Secure flag set.
 * Returns the `security.cookieSecure` config value directly.
 * The config validator (configValidator-server.ts) already blocks startup
 * when cookieSecure=false in production, so no heuristic fallback is needed.
 *
 * @returns True if the Secure flag should be set
 */
export function isSecureCookie(): boolean {
	return getConfig().security.cookieSecure;
}

/**
 * Build a Set-Cookie header string for an auth cookie.
 *
 * @param name
 * @param value
 * @param maxAge
 * @param cookiePath - Cookie path scope (default: '/')
 * @returns Set-Cookie header value
 */
export function buildCookieHeader(
	name: string,
	value: string,
	maxAge: number,
	cookiePath = '/',
): string {
	const secure = isSecureCookie() ? '; Secure' : '';
	return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${Math.floor(maxAge / 1000)}${secure}`;
}

/**
 * Build a Set-Cookie header that clears (expires) a cookie.
 *
 * @param name
 * @param cookiePath - Cookie path scope (must match the path used when setting, default: '/')
 * @returns Set-Cookie header value that clears cookie
 */
export function buildClearCookieHeader(name: string, cookiePath = '/'): string {
	const secure = isSecureCookie() ? '; Secure' : '';
	return `${name}=; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=0${secure}`;
}

type TokenPair = { accessToken: string; refreshToken: string };
type SecurityConfig = {
	authCookieName: string;
	cookieMaxAge: number;
	refreshCookieName: string;
};
type SetWithHeaders = { headers: Record<string, number | string> };

/**
 * Assign an array of Set-Cookie header strings to the response.
 * Elysia types `set.headers` as `Record<string, string>`, but the runtime
 * correctly handles an array for multiple Set-Cookie headers (RFC 6265 §4.1).
 * @param set
 * @param cookies
 */
function setMultipleCookies(set: SetWithHeaders, cookies: string[]): void {
	// Elysia runtime correctly handles string[] for set-cookie despite Record<string, string> typing
	(set.headers as Record<string, string | string[]>)['set-cookie'] = cookies;
}

/**
 * Set auth cookies on response headers - used by login and refresh endpoints.
 *
 * @param set - Elysia set object with headers
 * @param config - Security config with cookie names and max age
 * @param tokens - Access and refresh token pair
 */
export function setAuthCookies(
	set: SetWithHeaders,
	config: SecurityConfig,
	tokens: TokenPair,
): void {
	const appConfig = getConfig();
	const refreshMaxAgeMs = parseDurationMs(appConfig.security.jwtRefreshExpiresIn, 7 * MS_PER_DAY);
	setMultipleCookies(set, [
		buildCookieHeader(config.authCookieName, tokens.accessToken, config.cookieMaxAge),
		buildCookieHeader(
			config.refreshCookieName,
			tokens.refreshToken,
			refreshMaxAgeMs,
			REFRESH_COOKIE_PATH,
		),
	]);
}

/**
 * Clear auth cookies on response headers - used by logout and password change.
 *
 * @param set - Elysia set object with headers
 * @param config - Security config with cookie names
 */
export function clearAuthCookies(set: SetWithHeaders, config: SecurityConfig): void {
	setMultipleCookies(set, [
		buildClearCookieHeader(config.authCookieName),
		buildClearCookieHeader(config.refreshCookieName, REFRESH_COOKIE_PATH),
	]);
}
