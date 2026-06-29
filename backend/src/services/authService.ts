export { changeUserPassword, getUserPasswordHash } from './auth/authCore.ts';
export {
	hashPassword,
	isPasswordInHistory,
	recordPasswordHistory,
	verifyPassword,
} from './auth/authCore.ts';
export { confirmEmailChange, requestEmailChange } from './auth/authEmailChange.ts';
export {
	isLoginSuccess,
	login,
	type LoginFailureReason,
	recordSuccessfulLogin,
} from './auth/authLogin.ts';
export {
	generateEmailVerificationToken,
	requestPasswordReset,
	resetPassword,
	verifyEmail,
} from './auth/authPasswordReset.ts';
export {
	getAuthSettings,
	isPasswordExpired,
	updateAuthSettings,
} from './auth/authSecurityService.ts';
export { isMfaRateLimited, resetMfaAttempts } from './auth/mfaRateLimit.ts';
export {
	disableMfa,
	getMfaStatus,
	issueMfaChallengeToken,
	type MfaChallengePayload,
	type MfaSetupResult,
	type MfaStatus,
	type MfaVerifySetupResult,
	regenerateRecoveryCodes,
	setupMfa,
	verifyCode as verifyMfaCode,
	verifyMfaChallengeToken,
	verifyRecoveryCode,
	verifySetup as verifyMfaSetup,
} from './auth/mfaService.ts';
