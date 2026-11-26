import { and, eq } from 'drizzle-orm';

import type { SendEmailResult } from '../email/emailTypes.ts';

import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { endAllRefreshSessions } from '../../utils/auth/refreshSessions.ts';
import {
	getAuthSettings,
	hashPassword,
	isPasswordInHistory,
	recordPasswordHistory,
	requestPasswordReset,
} from '../authService.ts';
import { sendPasswordResetEmail } from '../emailService.ts';
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
 * @param sendResetEmail - Sends the reset link; the regression gate substitutes a recorder
 * @returns Object with success flag and optional error message
 */
async function adminResetUserPassword(
	actingAdminId: number,
	targetUserId: number,
	options: { mode: 'email' } | { mode: 'set'; password: string },
	sendResetEmail: (
		to: string,
		token: string,
	) => Promise<SendEmailResult> = sendPasswordResetEmail,
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

		if (await isPasswordInHistory(targetUserId, options.password, targetUser.passwordHash)) {
			return {
				error: 'This password was used recently. Please choose a different password.',
				success: false,
			};
		}

		const newHash = await hashPassword(options.password);

		// The reuse check and hashing are awaited after the row was read. The write claims the
		// row only if it is still active and still holds the hash that was checked, so a password
		// changed (or an account deleted) in that window is neither overwritten nor recorded as
		// history, and its sessions are left alone.
		const claimed = db.transaction((tx) => {
			const updated = tx
				.update(users)
				.set({
					csrfToken: null,
					failedLoginAttempts: 0,
					lockedUntil: null,
					passwordChangedAt: new Date(),
					passwordHash: newHash,
					...(isSelfReset ? {} : { requiresPasswordChange: true }),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(users.id, targetUserId),
						eq(users.isDeleted, false),
						eq(users.passwordHash, targetUser.passwordHash),
					),
				)
				.returning({ id: users.id })
				.all();
			if (updated.length !== 1) return false;
			recordPasswordHistory(targetUserId, targetUser.passwordHash, tx);
			endAllRefreshSessions(targetUserId, tx);
			return true;
		});

		if (!claimed) {
			return {
				error: 'The password was changed while this request ran. Please try again.',
				success: false,
			};
		}

		invalidateUserProfileCache(targetUserId);
		return { success: true };
	}

	// 'email' mode: generate a self-service reset token and send it. The account is only marked
	// once the message has gone, because the caller signs the user out on success: a reset that
	// reported success without sending left the user locked out with no link, and the admin told
	// it had been sent.
	const email = db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, targetUserId))
		.get();

	if (!email) {
		return { error: 'Target user email not found', success: false };
	}

	const result = requestPasswordReset(email.email);
	if (!result) {
		return {
			error: 'This user has no verified email address. Set a password directly instead.',
			success: false,
		};
	}

	const sent = await sendResetEmail(email.email, result.token);
	if (!sent.success) {
		return {
			error:
				sent.reason === SERVICE_ERRORS.SMTP_NOT_CONFIGURED
					? 'Email is not configured on this server. Set a password directly instead.'
					: 'The reset email could not be sent. Try again, or set a password directly.',
			success: false,
		};
	}

	if (!isSelfReset) {
		db.update(users)
			.set({ requiresPasswordChange: true, updatedAt: new Date() })
			.where(eq(users.id, targetUserId))
			.run();
	}

	invalidateUserProfileCache(targetUserId);
	return { success: true };
}

export { adminResetUserPassword };
