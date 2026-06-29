import { desc, eq, sql } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import { getDb } from '../../db/index.ts';
import { passwordHistory } from '../../db/schema/passwordHistory.ts';
import { users } from '../../db/schema/users.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { invalidatePasswordChangeCache } from '../../utils/passwordChangeCache.ts';
import { getAuthSettings, meetsMinPasswordAge } from './authSecurityService.ts';

/**
 * Hash a plaintext password using Bun.password (bcrypt algorithm).
 *
 * @param password - Plaintext password to hash
 * @returns Bcrypt hash string
 */
async function hashPassword(password: string): Promise<string> {
	const config = getConfig();
	return Bun.password.hash(password, { algorithm: 'bcrypt', cost: config.security.bcryptRounds });
}

/**
 * Verify a plaintext password against a bcrypt hash.
 *
 * @param password - Plaintext password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns True if the password matches the hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return Bun.password.verify(password, hash);
}

/**
 * Check whether a new password matches any of the user's recent password hashes.
 *
 * @param userId - ID of the user
 * @param newPassword - Plaintext password to check against history
 * @returns True if the password was recently used
 */
async function isPasswordInHistory(userId: number, newPassword: string): Promise<boolean> {
	const { passwordHistoryDepth } = getAuthSettings();
	if (passwordHistoryDepth <= 0) {
		return false;
	}

	const db = getDb();
	const recentHashes = db
		.select({ passwordHash: passwordHistory.passwordHash })
		.from(passwordHistory)
		.where(eq(passwordHistory.userId, userId))
		.orderBy(desc(passwordHistory.createdAt))
		.limit(passwordHistoryDepth)
		.all();

	const matches = await Promise.all(
		recentHashes.map((entry) => verifyPassword(newPassword, entry.passwordHash))
	);
	return matches.some(Boolean);
}

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * Record a password hash in the history table and trim entries beyond the configured depth.
 *
 * @param userId - ID of the user
 * @param hash - Bcrypt hash to store
 * @param tx - Optional transaction to use (for atomic password changes)
 */
function recordPasswordHistory(userId: number, hash: string, tx?: DbTransaction): void {
	const { passwordHistoryDepth } = getAuthSettings();
	if (passwordHistoryDepth <= 0) {
		return;
	}

	const client = tx ?? getDb();

	client
		.insert(passwordHistory)
		.values({ passwordHash: hash, userId })
		.onConflictDoNothing()
		.run();

	// Trim entries beyond the configured depth via subquery
	const keepIds = client
		.select({ id: passwordHistory.id })
		.from(passwordHistory)
		.where(eq(passwordHistory.userId, userId))
		.orderBy(desc(passwordHistory.createdAt))
		.limit(passwordHistoryDepth)
		.all()
		.map((e) => e.id);

	if (keepIds.length > 0) {
		client
			.delete(passwordHistory)
			.where(
				sql`${passwordHistory.userId} = ${userId} AND ${passwordHistory.id} NOT IN (${sql.join(
					keepIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			)
			.run();
	}
}

/**
 * Change a user's password after verifying the current password.
 * Checks against password history to prevent reuse.
 * Invalidates refresh tokens on success.
 *
 * @param userId - ID of the user changing their password
 * @param currentPassword - Current plaintext password for verification
 * @param newPassword - New plaintext password
 * @returns Object with success flag and optional error message
 */
async function changeUserPassword(
	userId: number,
	currentPassword: string,
	newPassword: string
): Promise<{ error?: string; success: boolean }> {
	const db = getDb();
	const user = db.select().from(users).where(eq(users.id, userId)).get();

	if (!user) {
		return { error: SERVICE_ERRORS.USER_NOT_FOUND, success: false };
	}

	if (!(await verifyPassword(currentPassword, user.passwordHash))) {
		return { error: SERVICE_ERRORS.INVALID_CREDENTIALS, success: false };
	}

	if (!user.requiresPasswordChange && !meetsMinPasswordAge(user.passwordChangedAt)) {
		return {
			error: 'Password was changed too recently. Please wait before changing it again.',
			success: false,
		};
	}

	if (currentPassword === newPassword) {
		return {
			error: 'New password must be different from the current password',
			success: false,
		};
	}

	const { requireSpecialCharacter } = getAuthSettings();
	const strengthError = validatePasswordStrength(newPassword, { requireSpecialCharacter });
	if (strengthError) {
		return { error: strengthError, success: false };
	}

	if (await isPasswordInHistory(userId, newPassword)) {
		return {
			error: 'This password was used recently. Please choose a different password.',
			success: false,
		};
	}

	const newHash = await hashPassword(newPassword);

	// Wrap password update + history recording in a transaction for atomicity
	db.transaction((tx) => {
		recordPasswordHistory(userId, user.passwordHash, tx);
		tx.update(users)
			.set({
				csrfToken: null,
				passwordChangedAt: new Date(),
				passwordHash: newHash,
				refreshTokenHash: null,
				requiresPasswordChange: false,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId))
			.run();
	});

	invalidatePasswordChangeCache(userId);
	return { success: true };
}

/**
 * Fetch a user's password hash by user ID.
 * Used by route handlers that need to verify the current password for
 * step-up re-authentication (e.g., MFA setup) without performing a full
 * user lookup.
 *
 * @param userId - ID of the user
 * @returns Password hash string, or null if user not found
 */
function getUserPasswordHash(userId: number): null | string {
	const result = getDb()
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	return result?.passwordHash ?? null;
}

export {
	changeUserPassword,
	getUserPasswordHash,
	hashPassword,
	isPasswordInHistory,
	recordPasswordHistory,
	verifyPassword,
};
