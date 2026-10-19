/**
 * Hermetic test keys for the script-side test worlds.
 *
 * The DB-backed test scripts call initializeConfig() and then sign real
 * ES256 tokens. On a checkout without an instance config (CI), the loader
 * falls back to config/example.json, whose key fields are symmetric
 * placeholder strings, and ES256 signing fails with "secretOrPrivateKey
 * must be an asymmetric key". Every world that signs tokens provisions
 * fresh ephemeral P-256 pairs here instead, so the tests depend on no
 * configuration that is not in the repository and on no secret material.
 */
import { generateEcKeyPair } from './crypto-keys.ts';

export interface EphemeralAuthKeys {
	jwtPrivateKey: string;
	jwtPublicKey: string;
	jwtRefreshPrivateKey: string;
	jwtRefreshPublicKey: string;
	mfaPrivateKey: string;
	mfaPublicKey: string;
}

/**
 * Apply ephemeral P-256 key pairs to a loaded config object's security
 * section. Call once after initializeConfig() and before the app signs.
 */
export function applyEphemeralAuthKeys(security: {
	jwtPrivateKey: string;
	jwtPublicKey: string;
	jwtRefreshPrivateKey: string;
	jwtRefreshPublicKey: string;
	mfaPrivateKey: string;
	mfaPublicKey: string;
}): EphemeralAuthKeys {
	const jwt = generateEcKeyPair();
	const refresh = generateEcKeyPair();
	const mfa = generateEcKeyPair();
	security.jwtPrivateKey = jwt.privateKey;
	security.jwtPublicKey = jwt.publicKey;
	security.jwtRefreshPrivateKey = refresh.privateKey;
	security.jwtRefreshPublicKey = refresh.publicKey;
	security.mfaPrivateKey = mfa.privateKey;
	security.mfaPublicKey = mfa.publicKey;
	return {
		jwtPrivateKey: jwt.privateKey,
		jwtPublicKey: jwt.publicKey,
		jwtRefreshPrivateKey: refresh.privateKey,
		jwtRefreshPublicKey: refresh.publicKey,
		mfaPrivateKey: mfa.privateKey,
		mfaPublicKey: mfa.publicKey,
	};
}
