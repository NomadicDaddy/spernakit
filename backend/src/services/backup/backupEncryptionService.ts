import {
	existsSync,
	readFileSync,
	readdirSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { getConfig } from '../../config/configLoader.ts';
import { logger } from '../../utils/logger.ts';
import { getBackupDirectory } from './backupLifecycleService.ts';

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;

/**
 * Derive an AES-256-GCM key for backup encryption using HKDF.
 * Uses a different HKDF info string than field-level encryption to ensure key isolation.
 *
 * @param salt
 * @param keyHex - Optional override for the HKDF base material (64 hex chars). Defaults to
 *                 `config.security.backupEncryptionKey`. Used by dual-key decrypt fallback
 *                 and by the rotation tool.
 * @returns AES-256-GCM CryptoKey for encryption/decryption
 */
async function deriveBackupKey(salt: Uint8Array<ArrayBuffer>, keyHex?: string): Promise<CryptoKey> {
	const material = keyHex ?? getConfig().security.backupEncryptionKey;
	const keyData = Buffer.from(material, 'hex');

	const baseKey = await crypto.subtle.importKey('raw', keyData, 'HKDF', false, [
		'deriveBits',
		'deriveKey',
	]);

	return await crypto.subtle.deriveKey(
		{
			hash: 'SHA-256',
			info: new TextEncoder().encode('spernakit-backup-encryption'),
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
 * Encrypt a backup file using AES-256-GCM.
 * Output format: salt (16 bytes) + IV (12 bytes) + ciphertext (includes GCM auth tag).
 *
 * Always encrypts with the current `backupEncryptionKey`.
 *
 * @param inputPath
 * @param outputPath
 * @param keyHex - Optional override for the encryption key (used by rotation tool).
 */
export async function encryptBackupFile(
	inputPath: string,
	outputPath: string,
	keyHex?: string
): Promise<void> {
	const data = readFileSync(inputPath);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await deriveBackupKey(salt, keyHex);

	const ciphertext = await crypto.subtle.encrypt({ iv, name: ENCRYPTION_ALGORITHM }, key, data);

	const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
	combined.set(salt);
	combined.set(iv, SALT_LENGTH);
	combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

	writeFileSync(outputPath, combined, { mode: 0o600 });
}

/**
 * Decrypt a backup file previously encrypted with encryptBackupFile.
 *
 * Tries the current `backupEncryptionKey` first and, on failure, retries with
 * `backupEncryptionKeyPrevious` when set. This supports graceful key rotation:
 * backups created before rotation remain decryptable under the previous key
 * until re-encrypted via {@link reEncryptAllBackups}.
 *
 * @param inputPath
 * @param outputPath
 */
export async function decryptBackupFile(inputPath: string, outputPath: string): Promise<void> {
	const raw = readFileSync(inputPath);
	const combined = new Uint8Array(raw);

	const salt = combined.slice(0, SALT_LENGTH) as Uint8Array<ArrayBuffer>;
	const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH) as Uint8Array<ArrayBuffer>;
	const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH) as Uint8Array<ArrayBuffer>;

	const config = getConfig();
	const primary = config.security.backupEncryptionKey;
	const previous = config.security.backupEncryptionKeyPrevious;

	const decrypted = await decryptWithKeys(salt, iv, ciphertext, [primary, previous]);

	writeFileSync(outputPath, new Uint8Array(decrypted), { mode: 0o600 });
}

/**
 * Attempt decryption with a sequence of candidate keys. Returns the plaintext
 * from the first key that succeeds. Throws if all keys fail.
 * @param salt
 * @param iv
 * @param ciphertext
 * @param candidateKeys
 * @returns Decrypted plaintext as ArrayBuffer
 */
async function decryptWithKeys(
	salt: Uint8Array<ArrayBuffer>,
	iv: Uint8Array<ArrayBuffer>,
	ciphertext: Uint8Array<ArrayBuffer>,
	candidateKeys: (string | undefined)[]
): Promise<ArrayBuffer> {
	let lastError: unknown;
	for (const keyHex of candidateKeys) {
		if (!keyHex) continue;
		try {
			const key = await deriveBackupKey(salt, keyHex);
			return await crypto.subtle.decrypt({ iv, name: ENCRYPTION_ALGORITHM }, key, ciphertext);
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error('Backup decryption failed with all candidate keys');
}

async function reEncryptOneBackup(
	sourcePath: string,
	primary: string,
	previous: string | undefined
): Promise<void> {
	const tempDecryptedPath = `${sourcePath}.tmp.plain`;
	const tempEncryptedPath = `${sourcePath}.tmp.enc`;

	try {
		const raw = readFileSync(sourcePath);
		const combined = new Uint8Array(raw);
		const salt = combined.slice(0, SALT_LENGTH) as Uint8Array<ArrayBuffer>;
		const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH) as Uint8Array<ArrayBuffer>;
		const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH) as Uint8Array<ArrayBuffer>;

		const plaintext = await decryptWithKeys(salt, iv, ciphertext, [primary, previous]);
		writeFileSync(tempDecryptedPath, new Uint8Array(plaintext), { mode: 0o600 });

		await encryptBackupFile(tempDecryptedPath, tempEncryptedPath, primary);

		renameSync(tempEncryptedPath, sourcePath);
		unlinkSync(tempDecryptedPath);
	} catch (err) {
		cleanupTempFiles(tempDecryptedPath, tempEncryptedPath);
		throw err;
	}
}

function cleanupTempFiles(...paths: string[]): void {
	for (const path of paths) {
		if (existsSync(path)) unlinkSync(path);
	}
}

/**
 * Re-encrypt every encrypted backup in the backup directory from the previous
 * key to the current key. Each file is decrypted with whichever candidate key
 * succeeds (current or previous), then re-encrypted atomically with the
 * provided target key via temp-file-plus-rename.
 *
 * Intended to be called after a SYSOP rotates `backupEncryptionKey` in config
 * and restarts. The endpoint exposing this function should require
 * `backupEncryptionKeyPrevious` to be set (so callers have an explicit
 * rotation marker), but this function itself is tolerant of missing prev key.
 *
 * @returns Counts of processed and failed files.
 */
export async function reEncryptAllBackups(): Promise<{ failed: number; processed: number }> {
	const config = getConfig();
	const primary = config.security.backupEncryptionKey;
	const previous = config.security.backupEncryptionKeyPrevious;
	const backupDir = getBackupDirectory();

	let processed = 0;
	let failed = 0;
	const files = readdirSync(backupDir).filter((f) => f.endsWith('.enc'));

	for (const filename of files) {
		const sourcePath = join(backupDir, filename);
		try {
			await reEncryptOneBackup(sourcePath, primary, previous);
			processed += 1;
			logger.info({ filename }, 'Re-encrypted backup under current key');
		} catch (err) {
			failed += 1;
			logger.error(
				{ error: err instanceof Error ? err.message : 'Unknown error', filename },
				'Failed to re-encrypt backup'
			);
		}
	}

	return { failed, processed };
}
