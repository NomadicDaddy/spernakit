/**
 * Extracted MFA route handlers.
 *
 * Named handler functions for the MFA (Multi-Factor Authentication) routes,
 * kept separate from the Elysia route chain in mfa.ts.
 */

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser } from '../../guards/role.ts';
import { type AuthPayload } from '../../plugins/auth.ts';
import {
	disableMfa,
	getMfaStatus,
	getUserPasswordHash,
	isMfaRateLimited,
	regenerateRecoveryCodes,
	resetMfaAttempts,
	setupMfa,
	verifyMfaChallengeToken,
	verifyMfaCode,
	verifyMfaSetup,
	verifyPassword,
	verifyRecoveryCode,
} from '../../services/authService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import {
	AUTH_ERROR_CODES,
	conflictError,
	internalError,
	isMfaAlreadyEnabledError,
	rateLimitError,
	unauthorizedError,
} from '../../utils/errorResponse.ts';
import { logAuth } from '../../utils/logger.ts';
import { issueAuthTokensForUser } from './mfa-helpers.ts';

type SetContext = { headers: Record<string, number | string>; status?: number | string };
type AuthCtx<B> = { body: B; set: SetContext; user: AuthPayload | null };
type ChallengeCtx<B> = { body: B; request: Request; set: SetContext };

async function handleMfaSetup({ body, set, user }: AuthCtx<{ currentPassword: string }>) {
	const authedUser = assertUser(user);
	setCacheHeaders(set, 'NO_CACHE');

	const { mfaPrivateKey, mfaPublicKey } = getConfig().security;
	if (!mfaPrivateKey || !mfaPublicKey) {
		set.status = HTTP_STATUS.CONFLICT;
		return conflictError(
			'MFA is not configured on this server. Run `bun run generate-keys` to provision the MFA signing key.',
			AUTH_ERROR_CODES.AUTH_MFA_NOT_CONFIGURED
		);
	}

	// Step-up re-authentication: require current password before emitting any
	// setup material. A stolen session alone must not be enough to obtain the
	// TOTP secret or backup-code blob.
	const passwordHash = getUserPasswordHash(authedUser.id);
	if (!passwordHash || !(await verifyPassword(body.currentPassword, passwordHash))) {
		logAuth('warn', 'MFA setup denied: invalid password', { userId: authedUser.id });
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'Current password is incorrect.',
			AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS
		);
	}

	try {
		const result = await setupMfa(authedUser.id);
		return dataResponse({
			qrUri: result.qrUri,
			secret: result.secret,
		});
	} catch (err) {
		if (isMfaAlreadyEnabledError(err)) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError(err.message, AUTH_ERROR_CODES.AUTH_MFA_ALREADY_ENABLED);
		}
		set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
		return internalError();
	}
}

function handleMfaStatus({ set, user }: { set: SetContext; user: AuthPayload | null }) {
	const authedUser = assertUser(user);
	setCacheHeaders(set, 'NO_CACHE');

	const status = getMfaStatus(authedUser.id);
	const { mfaPrivateKey, mfaPublicKey } = getConfig().security;
	const serverConfigured = Boolean(mfaPrivateKey && mfaPublicKey);
	return dataResponse({
		isEnabled: status?.isEnabled ?? false,
		method: status?.method ?? null,
		serverConfigured,
	});
}

async function handleVerifyMfaSetup({ body, set, user }: AuthCtx<{ code: string }>) {
	const authedUser = assertUser(user);
	setCacheHeaders(set, 'NO_CACHE');

	const result = await verifyMfaSetup(authedUser.id, body.code);
	if (!result) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'Invalid verification code. Please try again.',
			AUTH_ERROR_CODES.AUTH_MFA_INVALID_CODE
		);
	}

	logAuth('info', 'MFA setup verified and enabled', { userId: authedUser.id });
	return dataResponse({ backupCodes: result.backupCodes, success: true });
}

async function handleVerifyMfa({
	body,
	request,
	set,
}: ChallengeCtx<{ code: string; mfaToken: string }>) {
	setCacheHeaders(set, 'NO_CACHE');

	const userId = verifyMfaChallengeToken(body.mfaToken);
	if (userId === null) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'MFA challenge token is invalid or expired.',
			AUTH_ERROR_CODES.AUTH_MFA_TOKEN_INVALID
		);
	}

	if (isMfaRateLimited(userId)) {
		set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
		return rateLimitError(0);
	}

	const success = await verifyMfaCode(userId, body.code);
	if (!success) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'Invalid MFA code. Please try again.',
			AUTH_ERROR_CODES.AUTH_MFA_INVALID_CODE
		);
	}

	resetMfaAttempts(userId);
	// MFA verified — issue full auth tokens
	return await issueAuthTokensForUser(userId, request, set);
}

async function handleVerifyRecovery({
	body,
	request,
	set,
}: ChallengeCtx<{ mfaToken: string; recoveryCode: string }>) {
	setCacheHeaders(set, 'NO_CACHE');

	const userId = verifyMfaChallengeToken(body.mfaToken);
	if (userId === null) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'MFA challenge token is invalid or expired.',
			AUTH_ERROR_CODES.AUTH_MFA_TOKEN_INVALID
		);
	}

	if (isMfaRateLimited(userId)) {
		set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
		return rateLimitError(0);
	}

	const success = await verifyRecoveryCode(userId, body.recoveryCode);
	if (!success) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('Invalid recovery code.', AUTH_ERROR_CODES.AUTH_MFA_INVALID_CODE);
	}

	resetMfaAttempts(userId);
	// Recovery code verified — issue full auth tokens
	return await issueAuthTokensForUser(userId, request, set);
}

async function handleDisableMfa({ body, set, user }: AuthCtx<{ code: string }>) {
	const authedUser = assertUser(user);
	setCacheHeaders(set, 'NO_CACHE');

	const success = await disableMfa(authedUser.id, body.code);
	if (!success) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'Invalid code. MFA was not disabled.',
			AUTH_ERROR_CODES.AUTH_MFA_INVALID_CODE
		);
	}

	logAuth('info', 'MFA disabled', { userId: authedUser.id });
	return successResponse();
}

async function handleRegenerateRecoveryCodes({ body, set, user }: AuthCtx<{ code: string }>) {
	const authedUser = assertUser(user);
	setCacheHeaders(set, 'NO_CACHE');

	const codes = await regenerateRecoveryCodes(authedUser.id, body.code);
	if (!codes) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			'Invalid code. Recovery codes were not regenerated.',
			AUTH_ERROR_CODES.AUTH_MFA_INVALID_CODE
		);
	}

	return dataResponse({ backupCodes: codes });
}

export {
	handleDisableMfa,
	handleMfaSetup,
	handleMfaStatus,
	handleRegenerateRecoveryCodes,
	handleVerifyMfa,
	handleVerifyMfaSetup,
	handleVerifyRecovery,
};
