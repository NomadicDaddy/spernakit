/**
 * In-memory cache for the per-user `requiresPasswordChange` flag.
 *
 * Kept outside the password-change guard plugin so services can invalidate the
 * cache without importing from the plugin layer and creating a dependency cycle.
 */

/** TTL for the password-change flag cache (60 seconds). */
const CACHE_TTL_MS = 60_000;

/** userId -> { requiresChange, expiresAt }. */
const flagCache = new Map<number, { expiresAt: number; requiresChange: boolean }>();

/**
 * Return the cached flag value for a user if present and not expired.
 *
 * @param userId - ID of the authenticated user
 * @returns The cached `requiresChange` boolean, or `undefined` if there is no fresh entry
 */
function getCachedPasswordChange(userId: number): boolean | undefined {
	const cached = flagCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.requiresChange;
	}
	return undefined;
}

/**
 * Store a password-change flag value in the cache with the standard TTL.
 *
 * @param userId - ID of the authenticated user
 * @param requiresChange - Whether the user must change their password
 */
function setCachedPasswordChange(userId: number, requiresChange: boolean): void {
	flagCache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, requiresChange });
}

/**
 * Invalidate the password-change flag cache for a specific user.
 * Call after the user changes their password so the guard picks up the new state.
 *
 * @param userId - ID of the user whose cache entry should be cleared
 */
function invalidatePasswordChangeCache(userId: number): void {
	flagCache.delete(userId);
}

export { getCachedPasswordChange, invalidatePasswordChangeCache, setCachedPasswordChange };
