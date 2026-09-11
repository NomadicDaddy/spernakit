/**
 * Individual health check runner implementations.
 *
 * Each function performs a specific system check (database, memory,
 * filesystem, disk space) and returns a standardized CheckResult.
 *
 * @module healthCheckRunners
 */

import type { HealthStatus } from 'spernakit-shared';

import { count } from 'drizzle-orm';
import { existsSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckLogs } from '../../db/schema/healthChecks.ts';
import { getThresholds } from './healthConfigService.ts';
import { getMemoryUsage, memoryStatusFor } from './memoryUsage.ts';

interface CheckResult {
	checkType: string;
	details?: Record<string, unknown>;
	durationMs: number;
	status: HealthStatus;
}

const __healthDir = dirname(fileURLToPath(import.meta.url));
const healthProjectRoot = resolve(__healthDir, '..', '..', '..', '..');

/**
 * Resolve the application data directory from the database URL config.
 * For SQLite, this is the directory containing the database file.
 * Falls back to the project's data/ directory.
 *
 * @returns Absolute path to the data directory
 */
function getDataDirectory(): string {
	const config = getConfig();
	if (config.database.dialect === 'sqlite') {
		const dbUrl = config.database.url;
		const dbPath = dbUrl.startsWith('file:') ? dbUrl.substring(5) : dbUrl;
		const absoluteDbPath = resolve(
			healthProjectRoot,
			dbPath.startsWith('./') ? dbPath.substring(2) : dbPath,
		);
		return dirname(absoluteDbPath);
	}
	return resolve(healthProjectRoot, 'data');
}

/**
 * Run database connectivity check.
 *
 * @returns Check result for database
 */
function checkDatabase(): CheckResult {
	const start = performance.now();
	try {
		const db = getDb();
		const result = db.select({ value: count() }).from(healthCheckLogs).get();
		const durationMs = Math.round(performance.now() - start);
		return {
			checkType: 'database',
			details: { logCount: result?.value ?? 0 },
			durationMs,
			status: 'healthy',
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		return {
			checkType: 'database',
			details: { error: err instanceof Error ? err.message : 'Unknown error' },
			durationMs,
			status: 'unhealthy',
		};
	}
}

/**
 * Run memory usage check.
 *
 * Measures the resident set against the memory the process is allowed, which is the number a
 * container limit is enforced against and the one the OOM killer reads. See ./memoryUsage.ts for
 * why the heap ratio this used to compare is not that number.
 *
 * @returns Check result for memory
 */
function checkMemory(): CheckResult {
	const start = performance.now();
	const mem = process.memoryUsage();
	const usage = getMemoryUsage(mem.rss);
	const status = memoryStatusFor(usage.ratio, getThresholds());
	const durationMs = Math.round(performance.now() - start);

	return {
		checkType: 'memory',
		details: {
			heapTotal: mem.heapTotal,
			heapUsed: mem.heapUsed,
			memoryLimitBytes: usage.limitBytes,
			memoryLimitSource: usage.limitSource,
			// One decimal place: on a host with a lot of memory a healthy process rounds to a whole 0,
			// which reads as a measurement that was never taken.
			memoryPercentage: Math.round(usage.ratio * 1000) / 10,
			memoryUsedBytes: usage.usedBytes,
			rss: mem.rss,
		},
		durationMs,
		status,
	};
}

/**
 * Run filesystem access check against the application data volume.
 *
 * @returns Check result for filesystem
 */
function checkFilesystem(): CheckResult {
	const start = performance.now();
	const config = getConfig();
	const dataDir = getDataDirectory();
	const testFile = join(dataDir, `${config.app.slug}-health-${Date.now()}.tmp`);
	try {
		writeFileSync(testFile, 'health-check');
		const exists = existsSync(testFile);
		const durationMs = Math.round(performance.now() - start);
		return {
			checkType: 'filesystem',
			details: { directory: dataDir, writable: exists },
			durationMs,
			status: exists ? 'healthy' : 'degraded',
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		return {
			checkType: 'filesystem',
			details: {
				directory: dataDir,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			durationMs,
			status: 'unhealthy',
		};
	} finally {
		try {
			unlinkSync(testFile);
		} catch {
			// Cleanup is best-effort; file may not exist if write failed
		}
	}
}

/**
 * Run disk space check on the application data volume.
 *
 * @returns Check result for disk space
 */
function checkDiskSpace(): CheckResult {
	const start = performance.now();
	const dataDir = getDataDirectory();

	try {
		const stats = statfsSync(dataDir);
		const totalBytes = stats.blocks * stats.bsize;
		const freeBytes = stats.bfree * stats.bsize;
		const availableBytes = stats.bavail * stats.bsize;
		const freePercentage = totalBytes > 0 ? freeBytes / totalBytes : 0;
		const durationMs = Math.round(performance.now() - start);

		const thresholds = getThresholds();
		let status: HealthStatus = 'healthy';
		if (freePercentage < thresholds.diskSpaceUnhealthyThreshold) {
			status = 'unhealthy';
		} else if (freePercentage < thresholds.diskSpaceDegradedThreshold) {
			status = 'degraded';
		}

		return {
			checkType: 'disk',
			details: {
				availableBytes,
				freeBytes,
				freePercentage: Math.round(freePercentage * 100),
				totalBytes,
			},
			durationMs,
			status,
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		return {
			checkType: 'disk',
			details: {
				directory: dataDir,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			durationMs,
			status: 'unhealthy',
		};
	}
}

export { checkDatabase, checkDiskSpace, checkFilesystem, checkMemory };
export type { CheckResult };
