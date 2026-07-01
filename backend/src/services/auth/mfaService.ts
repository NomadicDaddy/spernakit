export { disableMfa, getMfaStatus, regenerateRecoveryCodes } from './mfa/mfaLifecycle.ts';
export { setupMfa, verifySetup } from './mfa/mfaSetup.ts';
export { issueMfaChallengeToken, verifyMfaChallengeToken } from './mfa/mfaTokens.ts';
/**
 * MFA Service Facade
 *
 * Re-exports from the mfa/ subdirectory. Consumers import from this file only.
 */
export type {
	MfaChallengePayload,
	MfaSetupResult,
	MfaStatus,
	MfaVerifySetupResult,
} from './mfa/mfaTypes.ts';
export { verifyCode, verifyRecoveryCode } from './mfa/mfaVerification.ts';
