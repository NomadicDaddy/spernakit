/**
 * MFA helper functions — recovery code generation and TOTP validation with step consumption.
 *
 * Extracted from mfaService.ts to keep the main service focused on
 * the public API (setup, verify, disable, etc.).
 */

import { and, eq, sql, type SQL } from 'drizzle-orm';
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
 * Find the TOTP time step a code belongs to.
 *
 * A code is valid for its own 30-second step and, within TOTP_WINDOW, the steps either side.
 * Returning the step rather than a boolean lets the caller consume it, so the same code can't be
 * accepted twice while it is still valid.
 *
 * @param secretBase32 Base32-encoded TOTP secret
 * @param code 6-digit TOTP code to validate
 * @param timestamp The time to validate at, in milliseconds (now by default)
 * @returns The matched time-step counter, or null when the code is not valid
 */
export function matchTotpStep(
	secretBase32: string,
	code: string,
	timestamp: number = Date.now(),
): null | number {
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secretBase32),
	});

	const delta = totp.validate({ timestamp, token: code, window: TOTP_WINDOW });
	return delta === null ? null : totp.counter({ timestamp }) + delta;
}

/**
 * The SQL condition that `step` has not been used yet: no code accepted before, or only codes
 * of earlier steps. A claim that sets lastAcceptedTotpStep under this condition consumes the step.
 * @param step The matched time-step counter
 * @returns The condition for a conditional update on mfa_settings
 */
export function totpStepUnused(step: number): SQL {
	return sql`(${mfaSettings.lastAcceptedTotpStep} is null or ${mfaSettings.lastAcceptedTotpStep} < ${step})`;
}

/**
 * The SQL condition that a row is still the exact enrollment that was read: the same row, for the
 * same user, holding the same secret ciphertext. Writes made after an awaited check use it, so a
 * re-enrollment (a new secret) or a replaced row is never written with the old check's outcome.
 * @param mfa The enrollment as read before the check
 * @param mfa.id The enrollment's row id
 * @param mfa.secretEncrypted The secret ciphertext the check decrypted
 * @param mfa.userId The enrollment's user
 * @returns The condition for a conditional update or delete on mfa_settings
 */
export function enrollmentIs(mfa: {
	id: number;
	secretEncrypted: string;
	userId: number;
}): SQL | undefined {
	return and(
		eq(mfaSettings.id, mfa.id),
		eq(mfaSettings.userId, mfa.userId),
		eq(mfaSettings.secretEncrypted, mfa.secretEncrypted),
	);
}

/**
 * Verify a TOTP code for a user with MFA enabled, and consume its time step.
 *
 * Load the enabled MFA record, decrypt the secret and match the code's step, then claim that step
 * with one conditional update. The claim names the exact enrollment that was checked (its id and
 * the secret ciphertext that was decrypted), requires it still enabled, and requires its
 * lastAcceptedTotpStep still earlier. A replayed code, a second request racing the first with the
 * same code, or an enrollment replaced or re-secreted while the secret was being decrypted, all
 * fail. Used by every TOTP check on an enabled account: the login challenge, disabling MFA and
 * regenerating recovery codes. A caller that writes afterwards must bind its write to the same
 * enrollment (see enrollmentIs) and treat a write that matches nothing as a refusal.
 *
 * @param userId The user's ID
 * @param code The 6-digit TOTP code
 * @returns The MFA row as read, if the code was valid and its step newly consumed; otherwise null
 */
export async function verifyAndConsumeMfaCode(
	userId: number,
	code: string,
): Promise<null | typeof mfaSettings.$inferSelect> {
	const db = getDb();
	const mfa = db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).get();
	if (!mfa?.isEnabled) return null;

	const secretBase32 = await decrypt(mfa.secretEncrypted);
	const step = matchTotpStep(secretBase32, code);
	if (step === null) return null;

	const now = new Date();
	const claimed = db
		.update(mfaSettings)
		.set({ lastAcceptedTotpStep: step, lastVerifiedAt: now, updatedAt: now })
		.where(and(enrollmentIs(mfa), eq(mfaSettings.isEnabled, true), totpStepUnused(step)))
		.returning({ id: mfaSettings.id })
		.all();
	return claimed.length === 1 ? mfa : null;
}
