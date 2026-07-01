/**
 * Database restore operations.
 *
 * Handles decryption, decompression, integrity verification,
 * emergency backup creation, and database file replacement.
 *
 * @module backupRestore
 */

import { copyFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { RestoreResult } from './backupRestoreHelpers.ts';

import { getConfig } from '../../config/configLoader.ts';
import { closeDatabase, getDb, initializeDatabase } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { logger } from '../../utils/logger.ts';
import { closeReadOnlyClient } from '../database-admin/rawClient.ts';
import { invalidateHealthCache } from '../health/healthChecks.ts';
import { verifyDatabaseIntegrity } from './backupIntegrityService.ts';
import {
	buildRestoreFailure,
	cleanupTempFiles,
	createEmergencyBackup,
	prepareForRestore,
	removeDbSidecarFiles,
	rollbackFromEmergency,
	validateBackupPath,
} from './backupRestoreHelpers.ts';

/**
 * Invalidates restored-database sessions after a successful file swap.
 *
 * @returns Warning messages that must be included in the restore response.
 */
function invalidateAllUserSessions(): string[] {
	const warnings: string[] = [];
	try {
		const db = getDb();
		db.update(users)
			.set({
				csrfToken: null,
				refreshTokenHash: null,
				updatedAt: new Date(),
			})
			.run();
		logger.info('Invalidated all user sessions after database restore');
	} catch (err) {
		logger.error({ err }, 'Failed to invalidate sessions after restore');
		warnings.push(
			'Session invalidation failed — active sessions may use stale data. ' +
				'Restart the server to force all users to re-authenticate.'
		);
	}
	return warnings;
}

/**
 * Reopens the SQLite connection on the resolved database file path.
 *
 * Restore operates directly on the SQLite file, so the connection is reopened
 * with the absolute path (config.database.url keeps its `file:` prefix and is
 * only resolved in app.ts) and the configured busy timeout, matching app.ts.
 *
 * @param dbPath - Absolute path to the SQLite database file.
 */
function reopenDatabase(dbPath: string): void {
	const config = getConfig();
	initializeDatabase(dbPath, 'sqlite', undefined, config.database.busyTimeoutMs);
}

/**
 * Restores the pre-restore database file and reopens the configured connection.
 *
 * @param dbPath - Active database file path to replace from the emergency backup.
 * @param emergencyBackupPath - Emergency backup path created before the restore attempt.
 */
async function attemptRollbackToEmergency(
	dbPath: string,
	emergencyBackupPath: string
): Promise<void> {
	try {
		// Close any connection opened since the restore attempt before touching the file
		await closeDatabase();
		closeReadOnlyClient();
		rollbackFromEmergency(dbPath, emergencyBackupPath);
		reopenDatabase(dbPath);
		logger.info('Rolled back to pre-restore state after failure');
	} catch (err) {
		logger.error(
			{ error: err },
			'Failed to roll back after restore failure — manual recovery may be needed'
		);
	}
}

async function performRestore(
	backupPath: string,
	startTime: number,
	dbPath: string
): Promise<RestoreResult> {
	const pathValidation = validateBackupPath(backupPath);
	if (!pathValidation.valid) {
		logger.error({ error: pathValidation.error }, 'Database restore path validation failed');
		return buildRestoreFailure(startTime, backupPath, pathValidation.error ?? 'Invalid path');
	}

	const preparation = await prepareForRestore(backupPath);
	if (preparation.error) {
		logger.error({ error: preparation.error }, 'Database restore preparation failed');
		return buildRestoreFailure(startTime, backupPath, preparation.error);
	}

	const integrity = verifyDatabaseIntegrity(preparation.rawPath, 'full');
	if (!integrity.healthy) {
		logger.error({ integrityMessage: integrity.message }, 'Backup integrity check failed');
		cleanupTempFiles(preparation.tempFiles);
		return buildRestoreFailure(startTime, backupPath, 'Backup integrity check failed');
	}

	let emergencyBackupPath: null | string = null;

	try {
		emergencyBackupPath = createEmergencyBackup(dbPath);

		// Close ALL database connections before overwriting the file to avoid corruption
		await closeDatabase();
		closeReadOnlyClient();
		// Remove stale WAL/SHM sidecars so the restored file is not paired with them
		removeDbSidecarFiles(dbPath);
		copyFileSync(preparation.rawPath, dbPath);

		// Reopen database connection with the restored file
		reopenDatabase(dbPath);

		const restoredIntegrity = verifyDatabaseIntegrity(dbPath, 'full');
		if (!restoredIntegrity.healthy) {
			logger.error(
				{ integrityMessage: restoredIntegrity.message, rolledBack: !!emergencyBackupPath },
				'Restored database integrity check failed'
			);
			// Rollback (with proper connection close/reopen) happens in the catch below
			throw new Error(
				emergencyBackupPath
					? 'Restored database integrity check failed, rolled back'
					: 'Restored database integrity check failed'
			);
		}

		invalidateHealthCache();
		const warnings = invalidateAllUserSessions();

		const durationMs = Math.round(performance.now() - startTime);
		logger.info({ durationMs, sourcePath: backupPath }, 'Database restored successfully');
		cleanupTempFiles(preparation.tempFiles);

		return {
			durationMs,
			emergencyBackupPath: emergencyBackupPath ? basename(emergencyBackupPath) : null,
			error: null,
			sourcePath: basename(backupPath),
			success: true,
			warnings,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error during restore';
		logger.error({ error: errorMessage }, 'Database restore failed');

		// Attempt rollback from emergency backup if available
		if (emergencyBackupPath) {
			await attemptRollbackToEmergency(dbPath, emergencyBackupPath);
		}

		cleanupTempFiles(preparation.tempFiles);
		return buildRestoreFailure(startTime, backupPath, errorMessage, emergencyBackupPath);
	}
}

/**
 * Restore the database from a backup file.
 *
 * @param backupPath - Path to the backup file to restore from
 * @param getDatabasePath - Function that returns the current database file path
 * @param isBackupRunningRef - Object with `value` property for mutex coordination
 * @param isBackupRunningRef.value - Boolean mutex flag indicating if a backup is in progress
 * @returns Restore operation result
 */
async function restoreFromBackup(
	backupPath: string,
	getDatabasePath: () => string,
	isBackupRunningRef: { value: boolean }
): Promise<RestoreResult> {
	const startTime = performance.now();

	if (isBackupRunningRef.value) {
		return buildRestoreFailure(
			startTime,
			backupPath,
			'A backup operation is already in progress'
		);
	}

	isBackupRunningRef.value = true;
	try {
		return await performRestore(backupPath, startTime, getDatabasePath());
	} finally {
		isBackupRunningRef.value = false;
	}
}

export { restoreFromBackup };
export type { RestoreResult };
