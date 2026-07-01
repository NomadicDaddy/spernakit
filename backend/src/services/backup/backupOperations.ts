import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { backupDatabaseTo } from '../../db/index.ts';
import { logger } from '../../utils/logger.ts';
import { sendAlertWithRetry } from '../notificationService.ts';
import { getByKeyRaw, update as updateSetting } from '../settingsService.ts';
import { compressBackupFile, encryptBackupFile } from './backupEncryptionService.ts';
import { verifyDatabaseIntegrity } from './backupIntegrityService.ts';
import { generateBackupFilename, getBackupDirectory } from './backupLifecycleService.ts';

interface BackupResult {
	backupPath: null | string;
	compressed: boolean;
	durationMs: number;
	encrypted: boolean;
	error: null | string;
	sizeBytes: number;
	success: boolean;
	timestamp: string;
}

const BACKUP_STATUS_SETTING_KEY = 'backup.lastResult';

function buildBackupResult(
	timestamp: string,
	startTime: number,
	options: {
		backupPath?: null | string;
		compressed?: boolean;
		encrypted?: boolean;
		error?: null | string | undefined;
		sizeBytes?: number;
		success: boolean;
	}
): BackupResult {
	return {
		backupPath: options.backupPath ?? null,
		compressed: options.compressed ?? false,
		durationMs: Math.round(performance.now() - startTime),
		encrypted: options.encrypted ?? false,
		error: options.error ?? null,
		sizeBytes: options.sizeBytes ?? 0,
		success: options.success,
		timestamp,
	};
}

function persistBackupStatus(result: BackupResult): void {
	try {
		updateSetting({
			description: 'Last backup result (auto-persisted)',
			key: BACKUP_STATUS_SETTING_KEY,
			updatedBy: null,
			value: JSON.stringify(result),
		});
	} catch (err) {
		logger.warn(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			'Failed to persist backup status to settings table'
		);
	}
}

function loadPersistedBackupStatus(): BackupResult | null {
	try {
		const row = getByKeyRaw(BACKUP_STATUS_SETTING_KEY);
		if (row?.value) {
			return JSON.parse(row.value) as BackupResult;
		}
	} catch (err) {
		logger.warn(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			'Failed to parse persisted backup status'
		);
	}
	return null;
}

function notifyBackupFailure(error: string): void {
	void sendAlertWithRetry({
		checkType: 'backup',
		createdAt: new Date(),
		id: 0,
		message: `Backup failed: ${error}`,
		severity: 'critical',
	}).catch((err: unknown) => {
		logger.warn(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			'Failed to send backup failure alert'
		);
	});
}

function performBackupCopy(dbPath: string): { backupPath: string; error?: string } {
	try {
		const backupDir = getBackupDirectory();
		const backupFilename = generateBackupFilename(dbPath);
		const backupPath = join(backupDir, backupFilename);

		if (!existsSync(dbPath)) {
			logger.error({ dbPath }, 'Source database not found');
			return { backupPath: '', error: 'Source database not found' };
		}

		backupDatabaseTo(backupPath);

		const integrity = verifyDatabaseIntegrity(backupPath, 'full');
		if (!integrity.healthy) {
			unlinkSync(backupPath);
			logger.error({ integrityMessage: integrity.message }, 'Backup integrity check failed');
			return { backupPath: '', error: 'Backup integrity check failed' };
		}

		return { backupPath };
	} catch (err) {
		const errorMessage =
			err instanceof Error ? err.message : 'Unknown error during backup copy';
		return { backupPath: '', error: errorMessage };
	}
}

/**
 * Apply optional compression and encryption to a raw backup file.
 *
 * @param rawBackupPath - Path to the unprocessed backup file
 * @param compress - Whether to apply gzip compression
 * @param encrypt - Whether to apply AES encryption
 * @returns Object with the final file path and optional error
 */
async function postProcessBackup(
	rawBackupPath: string,
	compress: boolean,
	encrypt: boolean
): Promise<{ error?: string; finalPath: string }> {
	let currentPath = rawBackupPath;

	try {
		if (compress) {
			const compressedPath = `${currentPath}.gz`;
			compressBackupFile(currentPath, compressedPath);
			unlinkSync(currentPath);
			currentPath = compressedPath;
			logger.info({ path: compressedPath }, 'Backup compressed');
		}

		if (encrypt) {
			const encryptedPath = `${currentPath}.enc`;
			await encryptBackupFile(currentPath, encryptedPath);
			unlinkSync(currentPath);
			currentPath = encryptedPath;
			logger.info({ path: encryptedPath }, 'Backup encrypted');
		}

		return { finalPath: currentPath };
	} catch (err) {
		if (currentPath !== rawBackupPath && existsSync(currentPath)) {
			unlinkSync(currentPath);
		}
		if (existsSync(rawBackupPath)) {
			unlinkSync(rawBackupPath);
		}
		const errorMessage =
			err instanceof Error ? err.message : 'Unknown error during backup post-processing';
		return { error: errorMessage, finalPath: '' };
	}
}

export {
	type BackupResult,
	buildBackupResult,
	loadPersistedBackupStatus,
	notifyBackupFailure,
	performBackupCopy,
	persistBackupStatus,
	postProcessBackup,
};
