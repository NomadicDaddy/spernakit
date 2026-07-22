import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RestoreResult } from './backupRestore.ts';

import { getConfig } from '../../config/configLoader.ts';
import { projectRoot } from '../../config/configUtils.ts';
import { BYTES_PER_MB } from '../../constants/files.ts';
import { logger } from '../../utils/logger.ts';
import { verifyDatabaseIntegrity } from './backupIntegrityService.ts';
import { cleanupOldBackups, listBackups } from './backupLifecycleService.ts';
import {
	type BackupResult,
	buildBackupResult,
	loadPersistedBackupStatus,
	notifyBackupFailure,
	performBackupCopy,
	persistBackupStatus,
	postProcessBackup,
} from './backupOperations.ts';
import { restoreFromBackup as restoreFromBackupImpl } from './backupRestore.ts';

interface BackupStatus {
	backupCount: number;
	backups: {
		compressed: boolean;
		encrypted: boolean;
		filename: string;
		sizeBytes: number;
		timestamp: string;
	}[];
	compress: boolean;
	enabled: boolean;
	encrypt: boolean;
	intervalHours: number;
	lastBackup: {
		compressed: boolean;
		encrypted: boolean;
		error: null | string;
		sizeBytes: number;
		success: boolean;
		timestamp: string;
	} | null;
	retentionDays: number;
	totalSizeBytes: number;
}

let lastBackupResult: BackupResult | null = null;
const backupMutex = { value: false };

function getDatabasePath(): string {
	const config = getConfig();
	return resolve(projectRoot, config.database.url.replace(/^file:/, ''));
}

function validateBackupEnabled(): { enabled: boolean; error?: string } {
	const config = getConfig();
	if (!config.database.backup.enabled) {
		return { enabled: false, error: 'Backup is disabled in configuration' };
	}
	return { enabled: true };
}

function finalizeBackupResult(
	timestamp: string,
	startTime: number,
	options: Parameters<typeof buildBackupResult>[2]
): BackupResult {
	const result = buildBackupResult(timestamp, startTime, options);
	lastBackupResult = result;
	persistBackupStatus(result);
	return result;
}

export async function createBackup(): Promise<BackupResult> {
	const timestamp = new Date().toISOString();
	const startTime = performance.now();

	if (backupMutex.value) {
		return finalizeBackupResult(timestamp, startTime, {
			error: 'A backup operation is already in progress',
			success: false,
		});
	}

	backupMutex.value = true;
	try {
		const validation = validateBackupEnabled();
		if (!validation.enabled) {
			return finalizeBackupResult(timestamp, startTime, {
				error: validation.error,
				success: false,
			});
		}
		const config = getConfig();
		const { compress, encrypt } = config.database.backup;
		const dbPath = getDatabasePath();
		const copyResult = performBackupCopy(dbPath);

		if (copyResult.error) {
			logger.error({ error: copyResult.error }, 'Database backup failed');
			notifyBackupFailure(copyResult.error);
			return finalizeBackupResult(timestamp, startTime, {
				error: copyResult.error,
				success: false,
			});
		}

		const postResult = await postProcessBackup(copyResult.backupPath, compress, encrypt);
		if (postResult.error) {
			logger.error({ error: postResult.error }, 'Database backup post-processing failed');
			notifyBackupFailure(postResult.error);
			return finalizeBackupResult(timestamp, startTime, {
				error: postResult.error,
				success: false,
			});
		}

		const stats = statSync(postResult.finalPath);
		logger.info(
			{
				compressed: compress,
				durationMs: Math.round(performance.now() - startTime),
				encrypted: encrypt,
				path: postResult.finalPath,
				sizeMB: (stats.size / BYTES_PER_MB).toFixed(2),
			},
			'Database backup created successfully'
		);

		await cleanupOldBackups();

		return finalizeBackupResult(timestamp, startTime, {
			backupPath: postResult.finalPath,
			compressed: compress,
			encrypted: encrypt,
			sizeBytes: stats.size,
			success: true,
		});
	} finally {
		backupMutex.value = false;
	}
}

export async function restoreFromBackup(backupPath: string): Promise<RestoreResult> {
	return restoreFromBackupImpl(backupPath, getDatabasePath, backupMutex);
}

export function getBackupStatus(): BackupStatus {
	if (!lastBackupResult) {
		lastBackupResult = loadPersistedBackupStatus();
	}
	const config = getConfig();
	const backups = listBackups();
	const totalSizeBytes = backups.reduce((sum, b) => sum + b.sizeBytes, 0);

	return {
		backupCount: backups.length,
		backups,
		compress: config.database.backup.compress,
		enabled: config.database.backup.enabled,
		encrypt: config.database.backup.encrypt,
		intervalHours: config.database.backup.intervalHours,
		lastBackup: lastBackupResult
			? {
					compressed: lastBackupResult.compressed,
					encrypted: lastBackupResult.encrypted,
					error: lastBackupResult.error,
					sizeBytes: lastBackupResult.sizeBytes,
					success: lastBackupResult.success,
					timestamp: lastBackupResult.timestamp,
				}
			: null,
		retentionDays: config.database.backup.retentionDays,
		totalSizeBytes,
	};
}

export { verifyDatabaseIntegrity };
