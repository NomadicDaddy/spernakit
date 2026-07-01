import { eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import {
	getAuthSettings,
	hashPassword,
	isPasswordInHistory,
	recordPasswordHistory,
} from '../authService.ts';
import { invalidateUserProfileCache } from './userCrudHelpers.ts';

/**
 * Admin-initiated password reset.
 * Supports two modes:
 *  - 'set': directly set a new password (validated against strength and history)
 *  - 'email': generate a self-service reset token for the target user
 *
 * When actingAdminId === targetUserId (self-reset), requiresPasswordChange is NOT set
 * so the admin's live session remains active.
 *
 * @param actingAdminId - The ID of the admin performing the reset
 * @param targetUserId - The ID of the user whose password is being reset
 * @param options - Mode-specific options ('set' with password or 'email')
 * @returns Object with success flag and optional error message
 */
async function adminResetUserPassword(
	actingAdminId: number,
	targetUserId: number,
	options: { mode: 'email' } | { mode: 'set'; password: string }
): Promise<{ error?: string; success: boolean }> {
	const db = getDb();
	const targetUser = db
		.select({
			id: users.id,
			isDeleted: users.isDeleted,
			passwordHash: users.passwordHash,
		})
		.from(users)
		.where(eq(users.id, targetUserId))
		.get();

	if (!targetUser || targetUser.isDeleted) {
		return { error: 'Target user not found', success: false };
	}

	const isSelfReset = actingAdminId === targetUserId;

	if (options.mode === 'set') {
		const { requireSpecialCharacter } = getAuthSettings();
		const strengthError = validatePasswordStrength(options.password, {
			requireSpecialCharacter,
		});
		if (strengthError) {
			return { error: strengthError, success: false };
		}

		if (await isPasswordInHistory(targetUserId, options.password)) {
			return {
				error: 'This password was used recently. Please choose a different password.',
				success: false,
			};
		}

		const newHash = await hashPassword(options.password);

		db.transaction((tx) => {
			recordPasswordHistory(targetUserId, targetUser.passwordHash, tx);
			tx.update(users)
				.set({
					csrfToken: null,
					failedLoginAttempts: 0,
					lockedUntil: null,
					passwordChangedAt: new Date(),
					passwordHash: newHash,
					refreshTokenHash: null,
					...(isSelfReset ? {} : { requiresPasswordChange: true }),
					updatedAt: new Date(),
				})
				.where(eq(users.id, targetUserId))
				.run();
		});

		invalidateUserProfileCache(targetUserId);
		return { success: true };
	}

	// 'email' mode — generate a self-service reset token
	// Delegate to requestPasswordReset from authService facade
	const { requestPasswordReset } = await import('../authService.ts');
	const email = db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, targetUserId))
		.get();

	if (!email) {
		return { error: 'Target user email not found', success: false };
	}

	// Set requiresPasswordChange for non-self resets BEFORE generating the reset token.
	// If token generation fails, the flag is already set (safe); the user will be prompted on next login.
	if (!isSelfReset) {
		db.update(users)
			.set({ requiresPasswordChange: true, updatedAt: new Date() })
			.where(eq(users.id, targetUserId))
			.run();
	}

	const result = requestPasswordReset(email.email);
	if (!result) {
		return { error: 'Failed to generate reset token', success: false };
	}

	invalidateUserProfileCache(targetUserId);
	return { success: true };
}

export { adminResetUserPassword };
