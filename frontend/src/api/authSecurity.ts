import type { DataResponse, SecurityHealthReport } from '@/api/types';

import { apiClient } from '@/api/client';

interface AuthSecuritySettings {
	authRateLimitEnabled: boolean;
	authRateLimitMaxRequests: number;
	authRateLimitWindowMinutes: number;
	enableAccountLocking: boolean;
	lockoutDurationMinutes: number;
	maxLoginAttempts: number;
	minPasswordAgeDays: number;
	passwordExpiryDays: number;
	passwordHistoryDepth: number;
	requirePasswordChange: boolean;
	requireSpecialCharacter: boolean;
	selfRegistrationEnabled: boolean;
}

function getAuthSecuritySettings(): Promise<DataResponse<AuthSecuritySettings>> {
	return apiClient.get<DataResponse<AuthSecuritySettings>>('/settings/auth-security');
}

function updateAuthSecuritySettings(
	settings: Partial<AuthSecuritySettings>
): Promise<DataResponse<AuthSecuritySettings>> {
	return apiClient.put<DataResponse<AuthSecuritySettings>>('/settings/auth-security', {
		body: settings,
	});
}

function getSecurityHealth(): Promise<DataResponse<SecurityHealthReport>> {
	return apiClient.get<DataResponse<SecurityHealthReport>>('/auth/security-health');
}

interface BackupKeyRotationResult {
	failed: number;
	processed: number;
}

function rotateBackupEncryptionKey(): Promise<DataResponse<BackupKeyRotationResult>> {
	return apiClient.post<DataResponse<BackupKeyRotationResult>>(
		'/settings/auth-security/rotate-backup-key'
	);
}

export {
	getAuthSecuritySettings,
	getSecurityHealth,
	rotateBackupEncryptionKey,
	updateAuthSecuritySettings,
};
export type { AuthSecuritySettings, BackupKeyRotationResult };
