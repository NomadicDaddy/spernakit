import { getConfig } from '../config/configLoader.ts';

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // For AES-GCM
const KEY_LENGTH = 256; // bits
const SALT_LENGTH = 16;

/**
 * Derive a crypto key from the encryption key in config.
 * Uses HKDF with SHA-256 for key derivation.
 *
 * @returns A CryptoKey for HKDF key derivation
 */
async function getCryptoKey(): Promise<CryptoKey> {
	const config = getConfig();
	const encryptionKey = config.security.encryptionKey;

	const keyData = Buffer.from(encryptionKey, 'hex');

	return await crypto.subtle.importKey('raw', keyData, 'HKDF', false, [
		'deriveBits',
		'deriveKey',
	]);
}

/**
 * Derive an AES-GCM key using HKDF with a per-encryption random salt.
 *
 * @param salt - Random salt bytes (must be SALT_LENGTH bytes)
 * @returns A CryptoKey for AES-GCM encryption/decryption
 */
async function deriveAesGcmKey(salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	const baseKey = await getCryptoKey();

	return await crypto.subtle.deriveKey(
		{
			hash: 'SHA-256',
			info: new TextEncoder().encode('spernakit-field-encryption'),
			name: 'HKDF',
			salt,
		},
		baseKey,
		{ length: KEY_LENGTH, name: ENCRYPTION_ALGORITHM },
		false,
		['encrypt', 'decrypt']
	);
}

/**
 * Encrypt a plaintext value using AES-GCM.
 * Returns a base64-encoded string containing salt + IV + ciphertext.
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded salt + IV + ciphertext
 */
export async function encrypt(plaintext: string): Promise<string> {
	if (!plaintext) {
		return '';
	}

	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const key = await deriveAesGcmKey(salt);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoder = new TextEncoder();
	const data = encoder.encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt({ iv, name: ENCRYPTION_ALGORITHM }, key, data);

	// Combine salt + IV + ciphertext, then encode as base64
	const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
	combined.set(salt);
	combined.set(iv, salt.length);
	combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

	return Buffer.from(combined).toString('base64');
}

/**
 * Decrypt a base64-encoded string containing salt + IV + ciphertext.
 * Returns the original plaintext value.
 *
 * @param encrypted - Base64-encoded salt + IV + ciphertext
 * @returns The decrypted plaintext string
 * @throws Error if decryption fails (invalid or corrupted data)
 */
export async function decrypt(encrypted: string): Promise<string> {
	if (!encrypted) {
		return '';
	}

	try {
		// Decode base64
		const binaryString = atob(encrypted);
		const combined = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			combined[i] = binaryString.charCodeAt(i);
		}

		// Extract salt, IV, and ciphertext
		const salt = combined.slice(0, SALT_LENGTH);
		const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
		const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

		const key = await deriveAesGcmKey(salt);

		const decrypted = await crypto.subtle.decrypt(
			{ iv, name: ENCRYPTION_ALGORITHM },
			key,
			ciphertext
		);

		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (err) {
		throw new Error(
			`Decryption failed: ${err instanceof Error ? err.message : 'Invalid or corrupted encrypted data'}`,
			{ cause: err }
		);
	}
}
