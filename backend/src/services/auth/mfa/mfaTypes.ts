import type { MfaMethod } from 'spernakit-shared';

export interface MfaSetupResult {
	qrUri: string;
	secret: string;
}

export interface MfaVerifySetupResult {
	backupCodes: string[];
	success: true;
}

export interface MfaChallengePayload {
	mfa: true;
	userId: number;
}

export interface MfaStatus {
	isEnabled: boolean;
	method: MfaMethod;
}
