/**
 * MFA helper functions — recovery code generation and TOTP validation.
 *
 * Extracted from mfaService.ts to keep the main service focused on
 * the public API (setup, verify, disable, etc.).
 */

import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

import { getDb } from '../../db/index.ts';
import { mfaSettings } from '../../db/schema/mfaSettings.ts';
import { decrypt } from '../../utils/encryption.ts';

/** Number of recovery codes to generate */
export const RECOVERY_CODE_COUNT = 10;

/** Length of each recovery code (characters) */
export const RECOVERY_CODE_LENGTH = 8;

/** TOTP time window tolerance (number of periods to allow before/after current) */
const TOTP_WINDOW = 1;

/**
 * Generate a random alphanumeric recovery code.
 * @returns An 8-character alphanumeric code
 */
export function generateRecoveryCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345678';
	let code = '';
	while (code.length < RECOVERY_CODE_LENGTH) {
		const bytes = randomBytes(1);
		const byte = bytes[0] ?? 0;
		if (byte < 248) {
			code += chars[byte % chars.length];
		}
	}
	return code;
}

/**
 * Format a recovery code with a dash in the middle for readability.
 * @param code Raw recovery code
 * @returns Dash-separated code (e.g. "ABCD-EFGH")
 */
export function formatRecoveryCode(code: string): string {
	const mid = Math.floor(code.length / 2);
	return `${code.slice(0, mid)}-${code.slice(mid)}`;
}

/**
 * Validate a TOTP code against a base32-encoded secret.
 * @param secretBase32 Base32-encoded TOTP secret
 * @param code 6-digit TOTP code to validate
 * @returns Whether the code is valid within the allowed time window
 */
export function validateTotpCode(secretBase32: string, code: string): boolean {
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secretBase32),
	});

	const delta = totp.validate({ token: code, window: TOTP_WINDOW });
	return delta !== null;
}

/**
 * Load the enabled MFA record for a user, decrypt the secret, and validate a TOTP code.
 * @param userId
 * @param code
 * @returns MFA row if valid, or null if not enabled or invalid code
 */
export async function verifyEnabledMfa(
	userId: number,
	code: string
): Promise<null | typeof mfaSettings.$inferSelect> {
	const db = getDb();
	const mfa = db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).get();
	if (!mfa?.isEnabled) return null;

	const secretBase32 = await decrypt(mfa.secretEncrypted);
	const isValid = validateTotpCode(secretBase32, code);
	return isValid ? mfa : null;
}
