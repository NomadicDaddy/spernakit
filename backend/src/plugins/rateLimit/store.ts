import type { RateLimitCheckResult } from '../../services/rateLimitService.ts';

import { msToRetryAfterSeconds } from '../../constants/auth.ts';
import { RATE_LIMIT_CLEANUP_INTERVAL_MS } from '../../constants/rateLimit.ts';

const MAX_IN_MEMORY_ENTRIES = 10_000;

/**
 * In-memory fallback for route-specific rate limits.
 * Route handlers must call checkRouteLimit(...) so config.rateLimit.backend
 * dispatches uniformly to memory or database storage.
 */
interface InMemoryEntry {
	count: number;
	maxRequests: number;
	resetAt: number;
}

interface RateLimitStore {
	check: (key: string, maxRequests: number, windowMs: number) => RateLimitCheckResult;
	reset: (key: string) => void;
	startCleanup: (onCleanup?: () => void) => void;
	stopCleanup: () => void;
}

function createRateLimitStore(): RateLimitStore {
	const entries = new Map<string, InMemoryEntry>();
	let interval: null | ReturnType<typeof setInterval> = null;

	function evictOldest(): void {
		if (entries.size <= MAX_IN_MEMORY_ENTRIES) return;
		let excess = entries.size - MAX_IN_MEMORY_ENTRIES;
		const now = Date.now();
		// Pass 1: evict expired entries first (resetAt already passed)
		for (const [key, entry] of entries) {
			if (excess <= 0) return;
			if (entry.resetAt <= now) {
				entries.delete(key);
				excess--;
			}
		}
		// Pass 2: evict oldest entries NOT currently over their limit, so an attacker
		// churning fresh keys cannot evict their own rate-limited bucket
		for (const [key, entry] of entries) {
			if (excess <= 0) return;
			if (entry.count <= entry.maxRequests) {
				entries.delete(key);
				excess--;
			}
		}
		// Pass 3: fall back to oldest insertion order if nothing else qualified
		for (const key of entries.keys()) {
			if (excess <= 0) return;
			entries.delete(key);
			excess--;
		}
	}

	return {
		check(key: string, maxRequests: number, windowMs: number): RateLimitCheckResult {
			const now = Date.now();
			const existing = entries.get(key);

			if (!existing || existing.resetAt <= now) {
				const resetAtMs = now + windowMs;
				entries.set(key, { count: 1, maxRequests, resetAt: resetAtMs });
				evictOldest();
				return { count: 1, limited: false, resetAt: new Date(resetAtMs) };
			}

			existing.count++;
			if (existing.count > maxRequests) {
				return {
					count: existing.count,
					limited: true,
					resetAt: new Date(existing.resetAt),
					retryAfter: msToRetryAfterSeconds(existing.resetAt, now),
				};
			}

			return { count: existing.count, limited: false, resetAt: new Date(existing.resetAt) };
		},

		reset(key: string): void {
			entries.delete(key);
		},

		startCleanup(onCleanup?: () => void): void {
			if (interval) return;
			interval = setInterval(() => {
				const now = Date.now();
				for (const [key, entry] of entries) {
					if (entry.resetAt <= now) entries.delete(key);
				}
				onCleanup?.();
			}, RATE_LIMIT_CLEANUP_INTERVAL_MS);
			interval.unref();
		},

		stopCleanup(): void {
			if (interval) {
				clearInterval(interval);
				interval = null;
			}
			entries.clear();
		},
	};
}

export { createRateLimitStore };
export type { RateLimitStore };
