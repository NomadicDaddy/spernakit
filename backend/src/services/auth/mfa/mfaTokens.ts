import jwt, { type SignOptions } from 'jsonwebtoken';

import type { MfaChallengePayload } from './mfaTypes.ts';

import { getConfig } from '../../../config/configLoader.ts';
import { logAuth } from '../../../utils/logger.ts';

/**
 * Issue a short-lived MFA challenge token for a user who has just authenticated
 * with their password but still needs to complete MFA verification.
 *
 * Returns null when the server has no dedicated MFA key pair configured.
 * @param userId - The ID of the user.
 * @returns Signed ES256 JWT carrying { mfa: true, userId }, or null if MFA is not configured.
 */
function issueMfaChallengeToken(userId: number): null | string {
	const config = getConfig();
	if (!config.security.mfaPrivateKey || !config.security.mfaPublicKey) return null;
	const payload: MfaChallengePayload = { mfa: true, userId };
	return jwt.sign(payload, config.security.mfaPrivateKey, {
		algorithm: 'ES256',
		audience: config.server.frontendUrl,
		expiresIn: config.security.mfaChallengeExpiresIn,
		issuer: config.server.backendUrl,
	} as SignOptions);
}

/**
 * Verify an MFA challenge token and return the userId.
 * Uses the dedicated MFA public key (separate from access/refresh keys).
 * @param token - The MFA challenge token to verify.
 * @returns The userId encoded in the token if valid, or null if invalid/expired/unconfigured.
 */
function verifyMfaChallengeToken(token: string): null | number {
	const config = getConfig();
	if (!config.security.mfaPublicKey) return null;
	try {
		const decoded = jwt.verify(token, config.security.mfaPublicKey, {
			algorithms: ['ES256'],
			audience: config.server.frontendUrl,
			issuer: config.server.backendUrl,
		}) as MfaChallengePayload;

		if (decoded.mfa !== true || typeof decoded.userId !== 'number') {
			return null;
		}

		return decoded.userId;
	} catch (err) {
		logAuth('debug', 'MFA challenge token verification failed', { err });
		return null;
	}
}

export { issueMfaChallengeToken, verifyMfaChallengeToken };
