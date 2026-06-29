import { lt, sql } from 'drizzle-orm';

import { MAX_CLEANUP_BATCH_SIZE } from '../constants/scheduler.ts';
import { getDb, getSqlTimestampParam } from '../db/index.ts';
import { rateLimitEntries } from '../db/schema/rateLimitEntries.ts';
import { logScheduler } from '../utils/logger.ts';
import { MAX_CLEANUP_BATCHES } from './scheduler/cleanupUtils.ts';

export interface RateLimitCheckResult {
	count: number;
	limited: boolean;
	resetAt: Date;
	retryAfter?: number;
}

/**
 * Atomically check and increment rate limit for the given key.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to avoid the TOCTOU race
 * that existed in the previous SELECT-then-UPDATE approach.
 * If the window has expired, the entry is reset atomically.
 *
 * @param key - The rate limit key (e.g., "ip:1.2.3.4" or "user:123")
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit check result with count, limited status, and reset time
 */
export function checkRateLimit(
	key: string,
	maxRequests: number,
	windowMs: number
): RateLimitCheckResult {
	const db = getDb();
	const now = new Date();
	const nowMs = now.getTime();
	const resetAt = new Date(nowMs + windowMs);
	const nowSqlParam = getSqlTimestampParam(now);
	const resetAtSqlParam = getSqlTimestampParam(resetAt);

	// Atomic upsert: insert with count=1, or if key exists:
	// - If window expired (reset_at <= now): reset count to 1 and new window
	// - If window active: increment count
	const result = db
		.insert(rateLimitEntries)
		.values({
			count: 1,
			createdAt: now,
			key,
			resetAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				count: sql`CASE
					WHEN ${rateLimitEntries.resetAt} <= ${nowSqlParam}
					THEN 1
					ELSE ${rateLimitEntries.count} + 1
				END`,
				resetAt: sql`CASE
					WHEN ${rateLimitEntries.resetAt} <= ${nowSqlParam}
					THEN ${resetAtSqlParam}
					ELSE ${rateLimitEntries.resetAt}
				END`,
				updatedAt: now,
			},
			target: rateLimitEntries.key,
		})
		.returning({
			count: rateLimitEntries.count,
			resetAt: rateLimitEntries.resetAt,
		})
		.get();

	if (!result) {
		return { count: 1, limited: false, resetAt };
	}

	if (result.count > maxRequests) {
		// Recalculate nowMs to account for time elapsed during the atomic upsert,
		// ensuring the retryAfter value is accurate and never zero or negative.
		const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
		return {
			count: result.count,
			limited: true,
			resetAt: result.resetAt,
			retryAfter,
		};
	}

	return {
		count: result.count,
		limited: false,
		resetAt: result.resetAt,
	};
}

/**
 * Delete expired rate-limit entries in bounded batches so a large backlog
 * (e.g. after downtime or an IP-flood event) does not hold the SQLite
 * write lock while a single unbounded DELETE scans the whole table.
 *
 * `now` is captured once before the loop so rows created mid-cleanup are
 * deferred to the next run — this prevents an infinite loop under heavy
 * write pressure.
 *
 * @returns Total number of expired entries deleted across all batches.
 */
export function cleanupExpiredRateLimitEntries(): number {
	const db = getDb();
	const now = new Date();
	let totalCleaned = 0;
	let batches = 0;

	while (batches < MAX_CLEANUP_BATCHES) {
		const idsToDelete = db
			.select({ id: rateLimitEntries.id })
			.from(rateLimitEntries)
			.where(lt(rateLimitEntries.resetAt, now))
			.limit(MAX_CLEANUP_BATCH_SIZE)
			.all()
			.map((row) => row.id);

		if (idsToDelete.length === 0) break;

		db.delete(rateLimitEntries)
			.where(sql`${rateLimitEntries.id} IN ${idsToDelete}`)
			.run();

		totalCleaned += idsToDelete.length;
		batches++;

		if (idsToDelete.length < MAX_CLEANUP_BATCH_SIZE) break;
	}

	if (batches >= MAX_CLEANUP_BATCHES) {
		logScheduler('warn', 'Rate-limit cleanup hit batch cap, remaining work deferred', {
			batches,
			cleaned: totalCleaned,
		});
	}

	return totalCleaned;
}
