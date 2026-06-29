/**
 * Shared cryptographic key generation primitives for scripts.
 *
 * Used by scripts/generate-keys.ts (explicit regeneration) and
 * scripts/load-json-config.ts (first-run config auto-create). Keep the
 * alphabet, rejection-sampling logic, and EC curve choices in this single
 * module so a security-relevant change does not have to be reproduced in
 * two places.
 */
import crypto from 'node:crypto';

export interface EcKeyPair {
	privateKey: string;
	publicKey: string;
}

/**
 * Generate a secure alphanumeric-plus-safe-symbols key using rejection
 * sampling to avoid modulo bias. The 79-character alphabet excludes
 * visually ambiguous characters (0/O, 1/l/I) and shell/dotenv unsafe
 * characters (# $). Default length 32.
 */
export function generateSecureKey(length = 32): string {
	const charset =
		'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@%^&*()_+-=[]{}|;:,.<>?';
	const maxUnbiased = Math.floor(256 / charset.length) * charset.length;
	let key = '';
	while (key.length < length) {
		const randomBytes = crypto.randomBytes(length * 2);
		for (let j = 0; j < randomBytes.length && key.length < length; j++) {
			const byte = randomBytes[j];
			if (byte === undefined || byte >= maxUnbiased) continue;
			key += charset[byte % charset.length];
		}
	}
	return key;
}

/** Generate a hex-encoded key from cryptographically random bytes. Default length 32 bytes → 64 hex chars. */
export function generateHexKey(length = 32): string {
	return crypto.randomBytes(length).toString('hex');
}

/** Generate a P-256 EC key pair encoded as PEM pkcs8/spki for JWT signing. */
export function generateEcKeyPair(): EcKeyPair {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
		publicKeyEncoding: { format: 'pem', type: 'spki' },
	});
	return { privateKey, publicKey };
}
