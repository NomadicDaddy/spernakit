import type { DataResponse } from './types';

import { apiClient } from './client';

interface BackupFile {
	compressed: boolean;
	encrypted: boolean;
	filename: string;
	sizeBytes: number;
	timestamp: string;
}

interface LastBackup {
	compressed: boolean;
	encrypted: boolean;
	error: null | string;
	sizeBytes: number;
	success: boolean;
	timestamp: string;
}

interface BackupStatus {
	backupCount: number;
	backups: BackupFile[];
	compress: boolean;
	enabled: boolean;
	encrypt: boolean;
	intervalHours: number;
	lastBackup: LastBackup | null;
	retentionDays: number;
	totalSizeBytes: number;
}

interface BackupResult {
	path: string;
	size: number;
	success: boolean;
}

interface RestoreResult {
	success: boolean;
	warnings?: string[];
}

function getBackupStatus(): Promise<DataResponse<BackupStatus>> {
	return apiClient.get<DataResponse<BackupStatus>>('/system/backup/status');
}

function triggerBackup(): Promise<DataResponse<BackupResult>> {
	return apiClient.post<DataResponse<BackupResult>>('/system/backup/trigger');
}

function restoreBackup(backupPath: string): Promise<DataResponse<RestoreResult>> {
	return apiClient.post<DataResponse<RestoreResult>>('/system/backup/restore', {
		body: { backupPath },
	});
}

export { getBackupStatus, restoreBackup, triggerBackup };
export type { BackupFile };
