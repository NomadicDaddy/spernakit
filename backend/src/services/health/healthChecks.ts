import type { HealthStatus } from 'spernakit-shared';

import type { CheckResult } from './healthCheckRunners.ts';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckLogs } from '../../db/schema/healthChecks.ts';
import { logger } from '../../utils/logger.ts';
import { createAlertAndNotify } from './healthAlertCreationService.ts';
import {
	checkDatabase,
	checkDiskSpace,
	checkFilesystem,
	checkMemory,
} from './healthCheckRunners.ts';
import { getHealthConfig, onHealthConfigChange } from './healthConfigService.ts';
import { getLastIntegrityCheck } from './healthIntegrityService.ts';

// Register cache invalidation callback to avoid circular import
onHealthConfigChange(() => {
	healthCache = null;
});

interface HealthCheckResult {
	checks: CheckResult[];
	databaseIntegrity: {
		healthy: boolean;
		lastCheckAt: null | string;
		message: null | string;
		mode: null | string;
	} | null;
	status: HealthStatus;
	timestamp: string;
}

/**
 * Cache TTL derived from the health check interval config (seconds -> ms).
 * Defaults to 60s if config is not yet loaded. This ensures Docker HEALTHCHECK
 * probes (every 30s) return cached results without triggering fresh I/O.
 *
 * @returns Cache TTL in milliseconds
 */
function getHealthCacheTtlMs(): number {
	try {
		const config = getConfig();
		return (config.healthCheck?.interval ?? 60) * 1000;
	} catch {
		return 60_000;
	}
}

let healthCache: { result: HealthCheckResult; timestamp: number } | null = null;

/**
 * Short cache TTL for readiness probes. Readiness gates traffic routing, so it
 * must notice DB-reachability changes much faster than the liveness cache
 * (healthCheck.interval, default 60s) allows.
 */
const READINESS_CACHE_TTL_MS = 5_000;

/**
 * Run all health checks and return aggregated result.
 * Results are cached for the configured health check interval to prevent
 * Docker HEALTHCHECK probes from triggering redundant I/O operations.
 *
 * @param maxCacheAgeMs - Optional cap on acceptable cache age; results older
 * than this are re-run even if within the configured TTL (used by readiness)
 * @returns Aggregated health check result with individual check details
 */
function runAllChecks(maxCacheAgeMs?: number): HealthCheckResult {
	const now = Date.now();
	const ttl = Math.min(maxCacheAgeMs ?? Number.POSITIVE_INFINITY, getHealthCacheTtlMs());
	if (healthCache && now - healthCache.timestamp < ttl) {
		return healthCache.result;
	}

	const healthConfig = getHealthConfig();
	const enabledMap = healthConfig.enabled;

	const allCheckers: { checker: () => CheckResult; name: string }[] = [
		{ checker: checkDatabase, name: 'database' },
		{ checker: checkMemory, name: 'memory' },
		{ checker: checkFilesystem, name: 'filesystem' },
		{ checker: checkDiskSpace, name: 'disk' },
	];

	const checks = allCheckers
		.filter(({ name }) => enabledMap[name] !== false)
		.map(({ checker }) => checker());

	let overallStatus: HealthStatus = 'healthy';
	for (const check of checks) {
		if (check.status === 'unhealthy') {
			overallStatus = 'unhealthy';
			break;
		}
		if (check.status === 'degraded') {
			overallStatus = 'degraded';
		}
	}

	const databaseIntegrity = getLastIntegrityCheck();

	if (databaseIntegrity && !databaseIntegrity.healthy) {
		overallStatus = 'unhealthy';
	}

	const result: HealthCheckResult = {
		checks,
		databaseIntegrity,
		status: overallStatus,
		timestamp: new Date().toISOString(),
	};

	healthCache = { result, timestamp: now };
	return result;
}

/**
 * Run all checks, store results in database, create alerts, and send notifications.
 *
 * @returns Aggregated health check result
 */
export function runAndStoreChecks(): HealthCheckResult {
	const result = runAllChecks();
	const db = getDb();

	const logsToInsert = result.checks.map((check) => ({
		checkType: check.checkType,
		details: check.details as Record<string, unknown>,
		durationMs: check.durationMs,
		status: check.status,
	}));

	if (logsToInsert.length > 0) {
		db.insert(healthCheckLogs).values(logsToInsert).run();
	}

	for (const check of result.checks) {
		if (check.status === 'healthy') {
			continue;
		}

		try {
			createAlertAndNotify(check);
		} catch (err) {
			logger.error({ err }, 'Failed to create health alert');
		}
	}

	return result;
}

/**
 * Run a single health check by check type.
 *
 * @param checkType - Type of check to run (database, disk, memory, filesystem)
 * @returns Result of specific check or null if check type not found
 */
export function runSingleCheck(checkType: string): CheckResult | null {
	switch (checkType) {
		case 'database':
			return checkDatabase();
		case 'disk':
			return checkDiskSpace();
		case 'filesystem':
			return checkFilesystem();
		case 'memory':
			return checkMemory();
		default:
			return null;
	}
}

/**
 * Store a health check result in database.
 *
 * @param check - Check result to store
 */
export function storeCheckResult(check: CheckResult): void {
	const db = getDb();
	db.insert(healthCheckLogs)
		.values({
			checkType: check.checkType,
			details: check.details as Record<string, unknown>,
			durationMs: check.durationMs,
			status: check.status,
		})
		.run();
}

/**
 * Run a single health check, store result, and return it.
 *
 * @param checkType - Type of check to run
 * @returns Check result with stored log entry, or null if check type invalid
 */
export function runAndStoreSingleCheck(checkType: string): CheckResult | null {
	const result = runSingleCheck(checkType);
	if (!result) {
		return null;
	}

	storeCheckResult(result);

	if (result.status !== 'healthy') {
		try {
			createAlertAndNotify(result);
		} catch (err) {
			logger.error({ err }, 'Failed to create health alert');
		}
	}

	return result;
}

/**
 * Invalidate the health check cache, forcing a fresh check on the next request.
 * Call after operations that fundamentally change database state (e.g., restore).
 */
function invalidateHealthCache(): void {
	healthCache = null;
}

export { invalidateHealthCache, READINESS_CACHE_TTL_MS, runAllChecks };
