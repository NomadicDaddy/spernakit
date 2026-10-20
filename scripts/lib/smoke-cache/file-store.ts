/**
 * Cache file storage for the smoke runner.
 *
 * Extracted from scripts/smoke-cache.ts so the orchestration file stays under the
 * 300-line guideline: locating, loading and persisting the cache JSON is one
 * cohesive concern, separate from the skip decisions and status batches above it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { SmokeCache, SmokeCacheDiagnostics } from './types.ts';

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'smoke-cache.json';

/**
 * Optional cache location override. The gate itself never passes one; the cache-status
 * regression seeds a disposable fixture file so a manufactured pass never lands in the
 * live project cache the runner reads.
 */
export interface CacheFileOptions {
	cachePath?: string;
}

export function getCachePath(projectRoot: string, cachePath?: string): string {
	return cachePath ?? join(projectRoot, 'scripts', CACHE_FILENAME);
}

export function loadCache(
	projectRoot: string,
	diagnostics?: SmokeCacheDiagnostics,
	cachePath?: string,
): SmokeCache {
	if (diagnostics) diagnostics.cacheLoads++;
	const resolvedPath = getCachePath(projectRoot, cachePath);

	if (!existsSync(resolvedPath)) {
		return {
			lastRun: '',
			steps: {},
			version: CACHE_VERSION,
		};
	}

	try {
		const raw = readFileSync(resolvedPath, 'utf-8');
		const cache = JSON.parse(raw) as SmokeCache;

		if (cache.version !== CACHE_VERSION) {
			return { lastRun: '', steps: {}, version: CACHE_VERSION };
		}

		return cache;
	} catch {
		return { lastRun: '', steps: {}, version: CACHE_VERSION };
	}
}

export function saveCache(projectRoot: string, cache: SmokeCache, cachePath?: string): void {
	const resolvedPath = getCachePath(projectRoot, cachePath);
	const logsDir = dirname(resolvedPath);

	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}

	writeFileSync(resolvedPath, JSON.stringify(cache, null, '\t'), 'utf-8');
}
