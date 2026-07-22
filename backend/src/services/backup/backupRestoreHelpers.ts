/**
 * Helpers for database restore operations: backup path validation,
 * emergency backup creation/rollback, decrypt/decompress preparation,
 * temp-file cleanup, and failure-result construction.
 *
 * @module backupRestoreHelpers
 */

import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { backupDatabaseTo } from '../../db/index.ts';
import { logger } from '../../utils/logger.ts';
import { decompressBackupFile } from './backupCompressionService.ts';
import { decryptBackupFile } from './backupEncryptionService.ts';
import { getBackupDirectory } from './backupLifecycleService.ts';

interface RestoreResult {
	durationMs: number;
	emergencyBackupPath: null | string;
	error: null | string;
	sourcePath: string;
	success: boolean;
	warnings?: string[];
}

function validateBackupPath(backupPath: string): { error?: string; valid: boolean } {
	const backupDir = getBackupDirectory();
	const resolvedPath = resolve(backupPath);

	// Use path.relative() for cross-platform path containment check.
	// If the resolved path escapes the backup directory, relative() will start with '..'
	const rel = relative(backupDir, resolvedPath);
	if (rel.startsWith('..') || resolvedPath === backupDir) {
		return { error: 'Invalid backup path: must be within the backup directory', valid: false };
	}

	if (!existsSync(resolvedPath)) {
		logger.error({ resolvedPath }, 'Backup file not found');
		return { error: 'Backup file not found', valid: false };
	}

	return { valid: true };
}

function createEmergencyBackup(dbPath: string): null | string {
	if (!existsSync(dbPath)) {
		return null;
	}

	const backupDir = getBackupDirectory();
	const emergencyFilename = `emergency-${Date.now()}.backup.db`;
	const emergencyBackupPath = join(backupDir, emergencyFilename);
	try {
		backupDatabaseTo(emergencyBackupPath);
	} catch (err) {
		logger.warn(
			{ emergencyBackupPath, err },
			'backupDatabaseTo failed during emergency-backup creation - falling back to copyFileSync'
		);
		// Fall back to file copy if VACUUM INTO fails (e.g., PostgreSQL dialect)
		copyFileSync(dbPath, emergencyBackupPath);
	}
	logger.info({ path: emergencyBackupPath }, 'Created emergency backup before restore');
	return emergencyBackupPath;
}

/**
 * Remove stale WAL/SHM sidecar files so a database file copied into place is
 * not paired with sidecars from the previous database state.
 *
 * @param dbPath - Database file path whose sidecars should be removed.
 */
function removeDbSidecarFiles(dbPath: string): void {
	for (const suffix of ['-wal', '-shm']) {
		const sidecarPath = `${dbPath}${suffix}`;
		if (existsSync(sidecarPath)) {
			unlinkSync(sidecarPath);
			logger.info({ path: sidecarPath }, 'Removed stale database sidecar file');
		}
	}
}

function rollbackFromEmergency(dbPath: string, emergencyBackupPath: null | string): void {
	if (emergencyBackupPath && existsSync(emergencyBackupPath)) {
		removeDbSidecarFiles(dbPath);
		copyFileSync(emergencyBackupPath, dbPath);
		logger.info({ path: emergencyBackupPath }, 'Rolled back from emergency backup');
	}
}

/**
 * Prepare a backup file for restore by decrypting and/or decompressing as needed.
 * Returns the path to a raw SQLite file ready for integrity check and restore.
 *
 * @param backupPath - Path to the backup file
 * @returns Raw SQLite path, temp files to clean up, and optional error
 */
async function prepareForRestore(
	backupPath: string
): Promise<{ error?: string; rawPath: string; tempFiles: string[] }> {
	const tempFiles: string[] = [];
	let currentPath = resolve(backupPath);
	const backupDir = getBackupDirectory();

	try {
		if (currentPath.endsWith('.enc')) {
			const decryptedPath = join(backupDir, `_restore_${Date.now()}.decrypted`);
			await decryptBackupFile(currentPath, decryptedPath);
			tempFiles.push(decryptedPath);
			currentPath = decryptedPath;
		}

		if (backupPath.endsWith('.gz.enc') || backupPath.endsWith('.gz')) {
			const decompressedPath = join(backupDir, `_restore_${Date.now()}.raw.db`);
			await decompressBackupFile(currentPath, decompressedPath);
			tempFiles.push(decompressedPath);
			currentPath = decompressedPath;
		}

		return { rawPath: currentPath, tempFiles };
	} catch (err) {
		for (const tmp of tempFiles) {
			if (existsSync(tmp)) {
				unlinkSync(tmp);
			}
		}
		const errorMessage =
			err instanceof Error ? err.message : 'Unknown error preparing backup for restore';
		return { error: errorMessage, rawPath: '', tempFiles: [] };
	}
}

function cleanupTempFiles(tempFiles: string[]): void {
	for (const tmp of tempFiles) {
		if (existsSync(tmp)) {
			unlinkSync(tmp);
		}
	}
}

function buildRestoreFailure(
	startTime: number,
	backupPath: string,
	error: string,
	emergencyBackupPath: null | string = null
): RestoreResult {
	return {
		durationMs: Math.round(performance.now() - startTime),
		emergencyBackupPath: emergencyBackupPath ? basename(emergencyBackupPath) : null,
		error,
		sourcePath: basename(backupPath),
		success: false,
	};
}

export {
	buildRestoreFailure,
	cleanupTempFiles,
	createEmergencyBackup,
	prepareForRestore,
	removeDbSidecarFiles,
	rollbackFromEmergency,
	validateBackupPath,
};
export type { RestoreResult };
