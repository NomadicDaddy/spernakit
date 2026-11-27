import type { MfaMethod } from 'spernakit-shared';

import { and, eq, isNull } from 'drizzle-orm';

import type { MfaStatus } from './mfaTypes.ts';

import { getDb } from '../../../db/index.ts';
import { mfaSettings } from '../../../db/schema/mfaSettings.ts';
import { encrypt } from '../../../utils/encryption.ts';
import { logAuth } from '../../../utils/logger.ts';
import {
	enrollmentIs,
	formatRecoveryCode,
	generateRecoveryCode,
	RECOVERY_CODE_COUNT,
	verifyAndConsumeMfaCode,
} from '../mfaHelpers.ts';

/**
 * Disable MFA for a user. Requires a valid TOTP code for security.
 * @param userId - The ID of the user disabling MFA.
 * @param code - The TOTP code for verification.
 * @returns True if MFA was disabled, false if verification failed.
 */
async function disableMfa(userId: number, code: string): Promise<boolean> {
	const mfa = await verifyAndConsumeMfaCode(userId, code);
	if (!mfa) return false;

	// Hard-delete the enrollment whose claim succeeded, and only while it is still that enabled
	// enrollment. If it was replaced in between, nothing is deleted and the disable is refused.
	const db = getDb();
	const deleted = db
		.delete(mfaSettings)
		.where(and(enrollmentIs(mfa), eq(mfaSettings.isEnabled, true)))
		.returning({ id: mfaSettings.id })
		.all();
	if (deleted.length !== 1) {
		logAuth('debug', 'MFA disable lost: enrollment changed after the code was checked', {
			userId,
		});
		return false;
	}

	logAuth('info', 'MFA disabled for user', { userId });
	return true;
}

/**
 * Regenerate recovery codes for a user. Requires a valid TOTP code.
 * @param userId - The ID of the user regenerating codes.
 * @param code - The TOTP code for verification.
 * @returns Array of new recovery codes, or null if verification failed.
 */
async function regenerateRecoveryCodes(userId: number, code: string): Promise<null | string[]> {
	const mfa = await verifyAndConsumeMfaCode(userId, code);
	if (!mfa) return null;

	const backupCodes: string[] = [];
	for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
		backupCodes.push(formatRecoveryCode(generateRecoveryCode()));
	}

	const backupCodesEncrypted = await encrypt(JSON.stringify(backupCodes));

	// Replace the codes of the enrollment whose claim succeeded, and only while it still holds the
	// codes that were read. A concurrent regenerate, a recovery-code login or a re-enrollment in
	// between makes this match nothing, and the caller is refused rather than handed codes that a
	// later write has already replaced.
	const db = getDb();
	const updated = db
		.update(mfaSettings)
		.set({ backupCodesEncrypted, updatedAt: new Date() })
		.where(
			and(
				enrollmentIs(mfa),
				eq(mfaSettings.isEnabled, true),
				mfa.backupCodesEncrypted === null
					? isNull(mfaSettings.backupCodesEncrypted)
					: eq(mfaSettings.backupCodesEncrypted, mfa.backupCodesEncrypted),
			),
		)
		.returning({ id: mfaSettings.id })
		.all();
	if (updated.length !== 1) {
		logAuth('debug', 'Recovery code regeneration lost: enrollment changed', { userId });
		return null;
	}

	logAuth('info', 'Recovery codes regenerated', { userId });
	return backupCodes;
}

/**
 * Get MFA status for a user.
 * @param userId - The ID of the user.
 * @returns The MFA status object, or null if MFA is not configured.
 */
function getMfaStatus(userId: number): MfaStatus | null {
	const db = getDb();

	const mfa = db
		.select({ isEnabled: mfaSettings.isEnabled, method: mfaSettings.method })
		.from(mfaSettings)
		.where(eq(mfaSettings.userId, userId))
		.get();

	if (!mfa) {
		return null;
	}

	return {
		isEnabled: mfa.isEnabled,
		method: mfa.method as MfaMethod,
	};
}

export { disableMfa, getMfaStatus, regenerateRecoveryCodes };
