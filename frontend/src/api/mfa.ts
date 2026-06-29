import type { MfaMethod } from 'spernakit-shared';

import type { UserData } from '@/api/auth';
import type { DataResponse, ErrorResponse } from '@/api/types';

import { ApiError, apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface MfaStatus {
	isEnabled: boolean;
	method: MfaMethod | null;
	serverConfigured: boolean;
}

interface MfaSetupResult {
	qrUri: string;
	secret: string;
}

interface MfaVerifySetupResult {
	backupCodes: string[];
	success: true;
}

interface RecoveryCodesResult {
	backupCodes: string[];
}

async function getMfaStatus(): Promise<MfaStatus> {
	const body = await apiClient.get<DataResponse<MfaStatus>>('/auth/mfa/status');
	return body.data;
}

async function setupMfa(currentPassword: string): Promise<MfaSetupResult> {
	const body = await apiClient.post<DataResponse<MfaSetupResult>>('/auth/mfa/setup', {
		body: { currentPassword },
	});
	return body.data;
}

async function verifyMfaSetup(code: string): Promise<MfaVerifySetupResult> {
	const body = await apiClient.post<DataResponse<MfaVerifySetupResult>>(
		'/auth/mfa/verify-setup',
		{ body: { code } }
	);
	return body.data;
}

async function disableMfa(code: string): Promise<void> {
	await apiClient.post('/auth/mfa/disable', { body: { code } });
}

async function regenerateRecoveryCodes(code: string): Promise<RecoveryCodesResult> {
	const body = await apiClient.post<DataResponse<RecoveryCodesResult>>(
		'/auth/mfa/recovery-codes',
		{ body: { code } }
	);
	return body.data;
}

async function completeChallenge(path: string, body: Record<string, string>): Promise<UserData> {
	const response = await apiClient.postWithResponse(path, { body });

	if (!response.ok) {
		let message = 'MFA verification failed';
		let code: ErrorResponse['code'] | undefined;
		let requestId: string | undefined;
		let details: Record<string, unknown> | undefined;
		try {
			const parsed = (await response.json()) as ErrorResponse;
			message = parsed.message ?? parsed.error ?? message;
			code = parsed.code;
			requestId = parsed.requestId;
			details = parsed.details;
		} catch {
			// Response body wasn't JSON
		}
		throw new ApiError(message, response.status, code, requestId, details);
	}

	const parsed = (await response.json()) as DataResponse<UserData>;
	const csrfToken = response.headers.get('X-CSRF-Token');
	if (csrfToken) {
		useAuthStore.getState().setCsrfToken(csrfToken);
	}
	return parsed.data;
}

async function verifyMfaChallenge(mfaToken: string, code: string): Promise<UserData> {
	return completeChallenge('/auth/mfa/verify', { code, mfaToken });
}

async function verifyMfaRecovery(mfaToken: string, recoveryCode: string): Promise<UserData> {
	return completeChallenge('/auth/mfa/verify-recovery', { mfaToken, recoveryCode });
}

export {
	disableMfa,
	getMfaStatus,
	regenerateRecoveryCodes,
	setupMfa,
	verifyMfaChallenge,
	verifyMfaRecovery,
	verifyMfaSetup,
};
export type { MfaSetupResult, MfaStatus, MfaVerifySetupResult, RecoveryCodesResult };
