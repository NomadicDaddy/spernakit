import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';

import { getDb } from '../../../db/index.ts';
import { mfaSettings } from '../../../db/schema/mfaSettings.ts';
import { decrypt, encrypt } from '../../../utils/encryption.ts';
import { logAuth } from '../../../utils/logger.ts';
import { verifyEnabledMfa } from '../mfaHelpers.ts';

/**
 * Verify a TOTP code during login (MFA challenge step).
 * @param userId - The user's ID
 * @param code - The 6-digit TOTP code
 * @returns True if the code is valid
 */
async function verifyCode(userId: number, code: string): Promise<boolean> {
	const mfa = await verifyEnabledMfa(userId, code);
	if (!mfa) return false;

	const db = getDb();
	db.update(mfaSettings)
		.set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
		.where(eq(mfaSettings.userId, userId))
		.run();

	return true;
}

/**
 * Verify a recovery/backup code during login. Consumes the code on success.
 *
 * Crypto (decrypt/encrypt) runs outside the transaction because bun:sqlite's
 * transaction API is synchronous. Correctness is preserved by capturing the
 * original ciphertext alongside the decrypted codes, then re-reading the
 * backup-codes blob inside the transaction and comparing it byte-for-byte
 * against the original.
 * @param userId - The user's ID
 * @param code - The recovery code
 * @returns True if the code was valid and consumed
 */
async function verifyRecoveryCode(userId: number, code: string): Promise<boolean> {
	const db = getDb();

	const mfa = db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).get();

	if (!mfa?.isEnabled || !mfa.backupCodesEncrypted) {
		return false;
	}

	const originalCiphertext = mfa.backupCodesEncrypted;
	const codesJson = await decrypt(originalCiphertext);
	let codes: string[];
	try {
		codes = JSON.parse(codesJson) as string[];
	} catch {
		logAuth('warn', 'Failed to parse MFA backup codes — corrupted data', { userId });
		return false;
	}

	// Constant-time comparison (case-insensitive, ignore dashes)
	const normalizedInput = code.toUpperCase().replace(/-/g, '');
	const inputBuf = Buffer.from(normalizedInput, 'utf8');
	let matchIndex = -1;
	for (let i = 0; i < codes.length; i++) {
		const stored = (codes[i] ?? '').toUpperCase().replace(/-/g, '');
		const storedBuf = Buffer.from(stored, 'utf8');
		if (inputBuf.length === storedBuf.length && timingSafeEqual(inputBuf, storedBuf)) {
			matchIndex = i;
		}
	}

	if (matchIndex === -1) {
		return false;
	}

	// Remove used code and pre-encrypt the new blob outside the transaction.
	codes.splice(matchIndex, 1);
	const updatedCodesEncrypted = await encrypt(JSON.stringify(codes));

	const committed = db.transaction((tx) => {
		// Re-read inside the transaction and compare against the snapshot taken
		// before decryption.
		const current = tx
			.select({ backupCodesEncrypted: mfaSettings.backupCodesEncrypted })
			.from(mfaSettings)
			.where(eq(mfaSettings.userId, userId))
			.get();

		if (current?.backupCodesEncrypted !== originalCiphertext) {
			return false;
		}

		tx.update(mfaSettings)
			.set({
				backupCodesEncrypted: updatedCodesEncrypted,
				lastVerifiedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(mfaSettings.userId, userId))
			.run();

		return true;
	});

	if (!committed) {
		logAuth('warn', 'Recovery code race detected — another request consumed a code first', {
			userId,
		});
		return false;
	}

	logAuth('info', 'Recovery code used', { codesRemaining: codes.length, userId });
	return true;
}

export { verifyCode, verifyRecoveryCode };
