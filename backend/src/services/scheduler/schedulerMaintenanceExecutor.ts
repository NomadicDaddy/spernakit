import { resolve } from 'node:path';

import type { UserRole } from '../../types/roles.ts';

import { getConfig } from '../../config/configLoader.ts';
import { projectRoot } from '../../config/configUtils.ts';
import { BYTES_PER_MB } from '../../constants/files.ts';
import { getDb, runVacuum } from '../../db/index.ts';
import { systemMetrics } from '../../db/schema/systemMetrics.ts';
import { logDatabase } from '../../utils/logger.ts';
import { createBackup, verifyDatabaseIntegrity } from '../backupService.ts';
import { broadcast } from '../notificationService.ts';

/**
 * Database vacuum task - runs SQLite VACUUM to reclaim space and optimize performance.
 *
 * @returns Vacuum operation results
 */
function databaseVacuumTask(): {
	freedBytes: number;
	freedMB: string;
	sizeAfterMB: string;
	sizeBeforeMB: string;
	success: boolean;
} {
	const result = runVacuum();
	return {
		freedBytes: result.freedBytes,
		freedMB: (result.freedBytes / BYTES_PER_MB).toFixed(2),
		sizeAfterMB: (result.sizeAfterBytes / BYTES_PER_MB).toFixed(2),
		sizeBeforeMB: (result.sizeBeforeBytes / BYTES_PER_MB).toFixed(2),
		success: result.success,
	};
}

/**
 * Database backup task - creates a backup of SQLite database.
 *
 * @returns Backup operation results
 */
async function databaseBackupTask(): Promise<{
	backupPath: string;
	durationMs: number;
	error: null | string;
	sizeMB: string;
	success: boolean;
	timestamp: string;
}> {
	const result = await createBackup();
	return {
		backupPath: result.backupPath ?? '',
		durationMs: result.durationMs,
		error: result.error,
		sizeMB: (result.sizeBytes / BYTES_PER_MB).toFixed(2),
		success: result.success,
		timestamp: result.timestamp,
	};
}

/**
 * Record an integrity check result as a system metric.
 * @param result
 * @param result.durationMs
 * @param result.healthy
 * @param result.message
 * @param mode
 */
function recordIntegrityMetric(
	result: { durationMs: number; healthy: boolean; message: string },
	mode: string
): void {
	getDb()
		.insert(systemMetrics)
		.values({
			metadata: {
				durationMs: result.durationMs,
				message: result.message,
				mode,
			} as Record<string, unknown>,
			metricType: 'database_integrity',
			value: result.healthy ? 1 : 0,
		})
		.run();
}

/**
 * Log and alert on integrity check result.
 * @param result
 * @param result.durationMs
 * @param result.healthy
 * @param result.message
 * @param mode
 */
function reportIntegrityResult(
	result: { durationMs: number; healthy: boolean; message: string },
	mode: string
): void {
	if (!result.healthy) {
		logDatabase('error', 'Database integrity check failed', {
			durationMs: result.durationMs,
			message: result.message,
			mode,
		});
		broadcast({
			message: `Database integrity check failed: ${result.message}. Immediate attention required.`,
			roleFilter: 'ADMIN' satisfies UserRole,
			title: 'Database Integrity Alert',
			type: 'error',
		});
	} else {
		logDatabase('info', 'Database integrity check passed', {
			durationMs: result.durationMs,
			mode,
		});
	}
}

/**
 * Database integrity check task - verifies database integrity and alerts on failures.
 *
 * @returns Integrity check results
 */
function databaseIntegrityCheckTask(): {
	durationMs: number;
	healthy: boolean;
	message: string;
	mode: string;
} {
	const config = getConfig();
	const dbPath = resolve(projectRoot, config.database.url.replace(/^file:/, ''));
	const mode = config.database.integrityCheck.mode as 'full' | 'quick';
	const result = verifyDatabaseIntegrity(dbPath, mode);

	recordIntegrityMetric(result, mode);
	reportIntegrityResult(result, mode);

	return {
		durationMs: result.durationMs,
		healthy: result.healthy,
		message: result.message,
		mode,
	};
}

export { databaseBackupTask, databaseIntegrityCheckTask, databaseVacuumTask };
