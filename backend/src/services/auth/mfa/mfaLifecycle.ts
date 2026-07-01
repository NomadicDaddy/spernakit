import type { MfaMethod } from 'spernakit-shared';

import { eq } from 'drizzle-orm';

import type { MfaStatus } from './mfaTypes.ts';

import { getDb } from '../../../db/index.ts';
import { mfaSettings } from '../../../db/schema/mfaSettings.ts';
import { encrypt } from '../../../utils/encryption.ts';
import { logAuth } from '../../../utils/logger.ts';
import {
	RECOVERY_CODE_COUNT,
	formatRecoveryCode,
	generateRecoveryCode,
	verifyEnabledMfa,
} from '../mfaHelpers.ts';

/**
 * Disable MFA for a user. Requires a valid TOTP code for security.
 * @param userId - The ID of the user disabling MFA.
 * @param code - The TOTP code for verification.
 * @returns True if MFA was disabled, false if verification failed.
 */
async function disableMfa(userId: number, code: string): Promise<boolean> {
	const mfa = await verifyEnabledMfa(userId, code);
	if (!mfa) return false;

	// Hard-delete the MFA record
	const db = getDb();
	db.delete(mfaSettings).where(eq(mfaSettings.userId, userId)).run();

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
	const mfa = await verifyEnabledMfa(userId, code);
	if (!mfa) return null;

	const backupCodes: string[] = [];
	for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
		backupCodes.push(formatRecoveryCode(generateRecoveryCode()));
	}

	const backupCodesEncrypted = await encrypt(JSON.stringify(backupCodes));

	const db = getDb();
	db.update(mfaSettings)
		.set({ backupCodesEncrypted, updatedAt: new Date() })
		.where(eq(mfaSettings.userId, userId))
		.run();

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
