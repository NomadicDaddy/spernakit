/**
 * Security key generation for the setup script.
 *
 * Extracted from scripts/setup.ts. These variants intentionally differ from
 * scripts/lib/crypto-keys.ts in default lengths and call sites — keep them
 * byte-for-byte compatible with the original setup behavior.
 */
import crypto from 'node:crypto';

export interface EcKeyPair {
	privateKey: string;
	publicKey: string;
}

export interface SecurityKeys {
	appApiKey: string;
	cookieSecret: string;
	encryptionKey: string;
	jwtKeyPair: EcKeyPair;
	jwtRefreshKeyPair: EcKeyPair;
}

export function generateSecretKey(length = 64): string {
	return crypto.randomBytes(length).toString('hex');
}

export function generateAlphanumericKey(length = 32): string {
	const chars =
		'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@%^&*()_+-=[]{}|;:,.<>?';
	const maxUnbiased = 256 - (256 % chars.length);
	let key = '';
	while (key.length < length) {
		const bytes = crypto.randomBytes(length * 2);
		for (let i = 0; i < bytes.length && key.length < length; i++) {
			const byte = bytes[i]!;
			if (byte < maxUnbiased) {
				key += chars[byte % chars.length];
			}
		}
	}
	return key;
}

export function generateEcKeyPair(): EcKeyPair {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
		publicKeyEncoding: { format: 'pem', type: 'spki' },
	});
	return { privateKey, publicKey };
}

export function generateKeys(): SecurityKeys {
	return {
		appApiKey: generateAlphanumericKey(48),
		cookieSecret: generateAlphanumericKey(32),
		encryptionKey: generateSecretKey(32),
		jwtKeyPair: generateEcKeyPair(),
		jwtRefreshKeyPair: generateEcKeyPair(),
	};
}
