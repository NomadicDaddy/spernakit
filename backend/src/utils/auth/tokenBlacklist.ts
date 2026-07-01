import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { MAX_CLEANUP_BATCH_SIZE } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { tokenBlacklist } from '../../db/schema/tokenBlacklist.ts';

/**
 * Persistent token blacklist for JWT revocation.
 *
 * Stores SHA-256 hashes of revoked access tokens with their expiry timestamps
 * in the database. Persists across process restarts so revoked tokens remain
 * invalid even after the server is restarted.
 *
 * Design decisions:
 * - Database-backed: Ensures revoked tokens stay invalid across restarts.
 * - SHA-256 hashing: Avoids storing raw JWT values in the database.
 * - Scheduled cleanup: Expired entries are purged by the token-cleanup task.
 * - userId column: Enables revoking all tokens for a user (e.g., on password change).
 */

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Add a token to the blacklist. The token remains blacklisted until its
 * natural JWT expiry time, after which it's cleaned up by the scheduled task.
 *
 * @param token - The raw JWT access token string
 * @param expiresAt - Unix timestamp (seconds) when the token expires (from JWT `exp` claim)
 * @param userId - User ID that owns the token
 */
function revokeAccessToken(token: string, expiresAt: number, userId?: number): void {
	const hash = hashToken(token);
	const db = getDb();
	db.insert(tokenBlacklist)
		.values({
			expiresAt: new Date(expiresAt * 1000),
			tokenHash: hash,
			userId: userId ?? 0,
		})
		.onConflictDoNothing()
		.run();
}

/**
 * Check if a token has been revoked (blacklisted).
 * Only considers entries that haven't expired yet (expiresAt > now).
 *
 * @param token - The raw JWT access token string
 * @returns true if the token is blacklisted and the entry hasn't expired
 */
function isTokenRevoked(token: string): boolean {
	const hash = hashToken(token);
	const db = getDb();
	const now = new Date();
	const entry = db
		.select({ id: tokenBlacklist.id })
		.from(tokenBlacklist)
		.where(and(eq(tokenBlacklist.tokenHash, hash), gt(tokenBlacklist.expiresAt, now)))
		.limit(1)
		.all();
	return entry.length > 0;
}

/**
 * Revoke all tokens for a specific user by inserting a sentinel entry.
 * The auth plugin checks for these entries via `isUserTokensRevokedAfter`.
 *
 * @param userId - User ID whose tokens should be revoked
 * @param expiresAt - When the longest-lived token would expire (use refresh token TTL)
 */
function revokeAllUserTokens(userId: number, expiresAt: Date): void {
	const sentinelHash = `user-revoke:${userId}:${Date.now()}`;
	const hash = hashToken(sentinelHash);
	const db = getDb();
	db.insert(tokenBlacklist)
		.values({
			expiresAt,
			tokenHash: hash,
			userId,
		})
		.run();
}

/**
 * Check if all tokens for a user have been revoked after a given timestamp.
 * Returns true if there's a revocation entry that was created after the token
 * was issued and hasn't expired yet.
 *
 * @param userId - User ID to check
 * @param tokenIssuedAt - When the token was issued (from JWT `iat` claim)
 * @returns true if a blanket revocation was created after the token was issued
 */
function isUserTokensRevokedAfter(userId: number, tokenIssuedAt: Date): boolean {
	const db = getDb();
	const now = new Date();
	const entry = db
		.select({ id: tokenBlacklist.id })
		.from(tokenBlacklist)
		.where(
			and(
				eq(tokenBlacklist.userId, userId),
				gt(tokenBlacklist.expiresAt, now),
				gt(tokenBlacklist.createdAt, tokenIssuedAt)
			)
		)
		.limit(1)
		.all();
	return entry.length > 0;
}

/**
 * Delete expired blacklist entries in batches. Called by the token-cleanup scheduled task.
 * Uses the same batched pattern as all other cleanup tasks to avoid unbounded deletes.
 *
 * @returns Object with batch count and total entries cleaned
 */
function cleanupExpiredBlacklistEntries(): { batches: number; cleaned: number } {
	const db = getDb();
	const now = new Date();
	let totalCleaned = 0;
	let batches = 0;
	const MAX_BATCHES = 100;

	while (batches < MAX_BATCHES) {
		const expiredIds = db
			.select({ id: tokenBlacklist.id })
			.from(tokenBlacklist)
			.where(lt(tokenBlacklist.expiresAt, now))
			.limit(MAX_CLEANUP_BATCH_SIZE)
			.all()
			.map((row) => row.id);

		if (expiredIds.length === 0) break;

		db.delete(tokenBlacklist).where(inArray(tokenBlacklist.id, expiredIds)).run();

		totalCleaned += expiredIds.length;
		batches++;

		if (expiredIds.length < MAX_CLEANUP_BATCH_SIZE) break;
	}

	return { batches, cleaned: totalCleaned };
}

export {
	cleanupExpiredBlacklistEntries,
	isTokenRevoked,
	isUserTokensRevokedAfter,
	revokeAccessToken,
	revokeAllUserTokens,
};
