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
	regenerateRecoveryCodes,
	setupMfa,
	verifyMfaChallengeToken,
	verifyCode as verifyMfaCode,
	verifySetup as verifyMfaSetup,
	verifyRecoveryCode,
} from './auth/mfaService.ts';
