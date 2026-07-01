import { and, eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import { logAuth } from '../../utils/logger.ts';
import { hashPassword, isPasswordInHistory, recordPasswordHistory } from './authCore.ts';

/**
 * Generate a cryptographically secure token with its SHA-256 hash and expiry date.
 * Used for password reset and email verification tokens.
 *
 * @param expiryMs - Token expiry duration in milliseconds
 * @returns Object containing the raw token, its SHA-256 hash, and expiry date
 */
function generateSecurityToken(expiryMs: number): {
	expiresAt: Date;
	token: string;
	tokenHash: string;
} {
	const token = randomBytes(32).toString('hex');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const expiresAt = new Date(Date.now() + expiryMs);
	return { expiresAt, token, tokenHash };
}

interface PasswordResetRequestResult {
	token: string;
}

/**
 * Generate a password reset token for the given email.
 * Returns the token on success, or null if the email is not found.
 * Always returns null without leaking whether the email exists.
 *
 * @param email - User email address
 * @returns PasswordResetRequestResult or null
 */
function requestPasswordReset(email: string): null | PasswordResetRequestResult {
	const db = getDb();
	const config = getConfig();

	const user = db
		.select()
		.from(users)
		.where(and(eq(users.email, email), eq(users.emailVerified, true)))
		.get();

	if (!user || user.isDeleted) {
		return null;
	}

	const { expiresAt, token, tokenHash } = generateSecurityToken(
		config.security.passwordResetTokenExpiryMs
	);

	db.update(users)
		.set({
			resetToken: tokenHash,
			resetTokenExpiresAt: expiresAt,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.id))
		.run();

	logAuth('info', 'Password reset token generated', { userId: user.id });
	return { token };
}

/**
 * Reset a user's password using a valid reset token.
 * Invalidates the token after use.
 *
 * @param token - Password reset token
 * @param newPassword - New plaintext password
 * @returns Object with success flag and userId on success, null on failure
 */
async function resetPassword(
	token: string,
	newPassword: string
): Promise<{ reason?: string; success: false } | { success: true; userId: number }> {
	const db = getDb();
	const tokenHash = createHash('sha256').update(token).digest('hex');

	const user = db.select().from(users).where(eq(users.resetToken, tokenHash)).get();

	if (!user || user.isDeleted) {
		logAuth('debug', 'Password reset failed: invalid token');
		return { success: false };
	}

	if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
		logAuth('debug', 'Password reset failed: token expired');
		db.update(users)
			.set({ resetToken: null, resetTokenExpiresAt: null, updatedAt: new Date() })
			.where(eq(users.id, user.id))
			.run();
		return { success: false };
	}

	if (await isPasswordInHistory(user.id, newPassword)) {
		logAuth('debug', 'Password reset failed: password in history', { userId: user.id });
		return { reason: SERVICE_ERRORS.PASSWORD_HISTORY, success: false };
	}

	const newHash = await hashPassword(newPassword);

	// Wrap password history recording and password update in a single transaction
	// so both succeed or fail atomically
	db.transaction((tx) => {
		recordPasswordHistory(user.id, user.passwordHash, tx);

		tx.update(users)
			.set({
				csrfToken: null,
				failedLoginAttempts: 0,
				lockedUntil: null,
				passwordChangedAt: new Date(),
				passwordHash: newHash,
				refreshTokenHash: null,
				requiresPasswordChange: false,
				resetToken: null,
				resetTokenExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id))
			.run();
	});

	const config = getConfig();
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	revokeAllUserTokens(user.id, new Date(Date.now() + refreshTtlMs));

	logAuth('info', 'Password reset completed', { userId: user.id });
	return { success: true, userId: user.id };
}

interface EmailVerificationTokenResult {
	token: string;
}

/**
 * Generate an email verification token for a user.
 * Stores the SHA-256 hash of the token in the database and sets expiry from config.
 *
 * @param userId - ID of the user to generate a verification token for
 * @returns The plaintext token to send via email, or null if user not found
 */
function generateEmailVerificationToken(userId: number): EmailVerificationTokenResult | null {
	const db = getDb();
	const config = getConfig();
	const user = db.select().from(users).where(eq(users.id, userId)).get();

	if (!user || user.isDeleted) {
		return null;
	}

	const { expiresAt, token, tokenHash } = generateSecurityToken(
		config.security.emailVerificationTokenExpiryMs
	);

	db.update(users)
		.set({
			emailVerificationExpiresAt: expiresAt,
			emailVerificationToken: tokenHash,
			updatedAt: new Date(),
		})
		.where(eq(users.id, userId))
		.run();

	logAuth('info', 'Email verification token generated', { userId });
	return { token };
}

/**
 * Verify a user's email using a verification token.
 * Validates the token hash, checks expiration, and sets emailVerified = true.
 *
 * @param token - Plaintext verification token from the email link
 * @returns True if verification succeeded, false if token is invalid/expired
 */
function verifyEmail(token: string): boolean {
	const db = getDb();
	const tokenHash = createHash('sha256').update(token).digest('hex');

	const user = db.select().from(users).where(eq(users.emailVerificationToken, tokenHash)).get();

	if (!user || user.isDeleted) {
		logAuth('debug', 'Email verification failed: invalid token');
		return false;
	}

	if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
		db.update(users)
			.set({
				emailVerificationExpiresAt: null,
				emailVerificationToken: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id))
			.run();
		logAuth('debug', 'Email verification failed: token expired', { userId: user.id });
		return false;
	}

	if (user.emailVerified) {
		// Clear any lingering verification token to prevent reuse
		db.update(users)
			.set({
				emailVerificationExpiresAt: null,
				emailVerificationToken: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id))
			.run();
		logAuth('debug', 'Email verification: already verified, cleared stale token', {
			userId: user.id,
		});
		return true;
	}

	db.update(users)
		.set({
			emailVerificationExpiresAt: null,
			emailVerificationToken: null,
			emailVerified: true,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.id))
		.run();

	logAuth('info', 'Email verified successfully', { userId: user.id });
	return true;
}

export { generateEmailVerificationToken, requestPasswordReset, resetPassword, verifyEmail };
