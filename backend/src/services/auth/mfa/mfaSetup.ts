import { and, eq } from 'drizzle-orm';
import { Secret, TOTP } from 'otpauth';

import type { MfaSetupResult, MfaVerifySetupResult } from './mfaTypes.ts';

import { getConfig } from '../../../config/configLoader.ts';
import { getDb } from '../../../db/index.ts';
import { mfaSettings } from '../../../db/schema/mfaSettings.ts';
import { users } from '../../../db/schema/users.ts';
import { decrypt, encrypt } from '../../../utils/encryption.ts';
import { MfaAlreadyEnabledError, NotFoundError } from '../../../utils/errorResponse.ts';
import { logAuth } from '../../../utils/logger.ts';
import {
	RECOVERY_CODE_COUNT,
	formatRecoveryCode,
	generateRecoveryCode,
	validateTotpCode,
} from '../mfaHelpers.ts';

/**
 * Initiate MFA setup for a user. Generates a TOTP secret, encrypts it,
 * creates recovery codes, and stores everything in the database.
 * Does NOT enable MFA — user must verify a code first via `verifySetup`.
 *
 * Backup codes are generated and persisted encrypted here but are NOT returned;
 * they are emitted only after the user proves possession of the TOTP via
 * `verifySetup`.
 *
 * @param userId - The ID of the user setting up MFA.
 * @returns The TOTP secret and QR code URI for the authenticator app.
 */
async function setupMfa(userId: number): Promise<MfaSetupResult> {
	const db = getDb();
	const config = getConfig();

	const user = db
		.select({ email: users.email, username: users.username })
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!user) {
		throw new NotFoundError('User');
	}

	// Check if MFA already exists for this user
	const existing = db
		.select({ id: mfaSettings.id, isEnabled: mfaSettings.isEnabled })
		.from(mfaSettings)
		.where(eq(mfaSettings.userId, userId))
		.get();

	if (existing?.isEnabled) {
		throw new MfaAlreadyEnabledError();
	}

	// Generate TOTP secret
	const secret = new Secret({ size: 20 });
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		issuer: config.app.name,
		label: user.username,
		period: 30,
		secret,
	});

	const qrUri = totp.toString();
	const secretBase32 = secret.base32;

	// Generate recovery codes
	const backupCodes: string[] = [];
	for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
		backupCodes.push(formatRecoveryCode(generateRecoveryCode()));
	}

	// Encrypt secret and backup codes in parallel
	const [secretEncrypted, backupCodesEncrypted] = await Promise.all([
		encrypt(secretBase32),
		encrypt(JSON.stringify(backupCodes)),
	]);

	const now = new Date();

	if (existing) {
		// Update existing unenabled MFA record
		db.update(mfaSettings)
			.set({
				backupCodesEncrypted,
				isEnabled: false,
				method: 'totp',
				secretEncrypted,
				updatedAt: now,
			})
			.where(eq(mfaSettings.id, existing.id))
			.run();
	} else {
		// Create new MFA record
		db.insert(mfaSettings)
			.values({
				backupCodesEncrypted,
				createdAt: now,
				isEnabled: false,
				method: 'totp',
				secretEncrypted,
				updatedAt: now,
				userId,
			})
			.run();
	}

	logAuth('info', 'MFA setup initiated', { userId });

	return { qrUri, secret: secretBase32 };
}

/**
 * Verify a TOTP code during initial MFA setup. On success, enables MFA for the
 * user and returns the one-time backup codes that were persisted during setup.
 *
 * Backup codes are delivered here (not in `setupMfa`) so they are only exposed
 * after the user has proven possession of their TOTP device. The enable flip
 * is guarded by a row-level compare-and-set so codes are emitted at most once:
 * concurrent verify-setup calls lose the race and return null.
 * @param userId - The ID of the user verifying MFA setup.
 * @param code - The TOTP code to verify.
 * @returns The backup codes on success, or null if verification failed.
 */
async function verifySetup(userId: number, code: string): Promise<MfaVerifySetupResult | null> {
	const db = getDb();

	const mfa = db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).get();

	if (!mfa) {
		logAuth('debug', 'MFA verify setup failed: no MFA record', { userId });
		return null;
	}

	if (mfa.isEnabled) {
		logAuth('debug', 'MFA verify setup failed: already enabled', { userId });
		return null;
	}

	if (!mfa.backupCodesEncrypted) {
		logAuth('warn', 'MFA verify setup failed: missing backup codes blob', { userId });
		return null;
	}

	const [secretBase32, backupCodesJson] = await Promise.all([
		decrypt(mfa.secretEncrypted),
		decrypt(mfa.backupCodesEncrypted),
	]);

	const isValid = validateTotpCode(secretBase32, code);
	if (!isValid) {
		logAuth('debug', 'MFA verify setup failed: invalid code', { userId });
		return null;
	}

	let backupCodes: string[];
	try {
		backupCodes = JSON.parse(backupCodesJson) as string[];
	} catch {
		logAuth('warn', 'MFA verify setup failed: corrupted backup codes blob', { userId });
		return null;
	}

	// Compare-and-set: only flip enabled -> true if it is still false. Ensures
	// backup codes are emitted at most once even under concurrent verify-setup.
	const now = new Date();
	const updated = db
		.update(mfaSettings)
		.set({ isEnabled: true, lastVerifiedAt: now, updatedAt: now })
		.where(and(eq(mfaSettings.userId, userId), eq(mfaSettings.isEnabled, false)))
		.returning({ id: mfaSettings.id })
		.all();

	if (updated.length === 0) {
		logAuth('debug', 'MFA verify setup race lost: another caller already enabled', { userId });
		return null;
	}

	logAuth('info', 'MFA enabled for user', { userId });
	return { backupCodes, success: true };
}

export { setupMfa, verifySetup };
