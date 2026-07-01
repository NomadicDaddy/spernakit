import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import { getDb } from '../../db/index.ts';
import { emailChangeTokens } from '../../db/schema/emailChangeTokens.ts';
import { users } from '../../db/schema/users.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import { logAuth } from '../../utils/logger.ts';
import { verifyPassword } from './authCore.ts';

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

type RequestEmailChangeResult =
	| { newEmail: string; oldEmail: string; success: true; token: string }
	| {
			reason:
				| typeof SERVICE_ERRORS.EMAIL_TAKEN
				| typeof SERVICE_ERRORS.INVALID_PASSWORD
				| typeof SERVICE_ERRORS.USER_NOT_FOUND;
			success: false;
	  };

/**
 * Initiate an email change for an authenticated user.
 * Verifies the current password (step-up), checks the new address is not in use,
 * and creates a one-time confirmation token delivered out-of-band to the NEW address.
 * The `users.email` column is NOT changed until the token is confirmed.
 *
 * @param userId - Authenticated user requesting the change
 * @param currentPassword - Plaintext current password for step-up verification
 * @param newEmail - Desired new email address (already validated by route schema)
 * @returns Result describing success (with plaintext token + old/new emails for mailers) or reason
 */
async function requestEmailChange(
	userId: number,
	currentPassword: string,
	newEmail: string
): Promise<RequestEmailChangeResult> {
	const db = getDb();
	const config = getConfig();

	const user = db.select().from(users).where(eq(users.id, userId)).get();
	if (!user || user.isDeleted) {
		return { reason: SERVICE_ERRORS.USER_NOT_FOUND, success: false };
	}

	if (!(await verifyPassword(currentPassword, user.passwordHash))) {
		logAuth('warn', 'Email change denied: invalid password', { userId });
		return { reason: SERVICE_ERRORS.INVALID_PASSWORD, success: false };
	}

	const normalizedNewEmail = newEmail.toLowerCase().trim();

	if (normalizedNewEmail === user.email.toLowerCase()) {
		return { reason: SERVICE_ERRORS.EMAIL_TAKEN, success: false };
	}

	const existing = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.email, normalizedNewEmail), eq(users.isDeleted, false)))
		.get();
	if (existing) {
		return { reason: SERVICE_ERRORS.EMAIL_TAKEN, success: false };
	}

	const { expiresAt, token, tokenHash } = generateSecurityToken(
		config.security.emailChangeTokenExpiryMs
	);

	db.insert(emailChangeTokens)
		.values({
			expiresAt,
			newEmail: normalizedNewEmail,
			tokenHash,
			userId,
		})
		.run();

	logAuth('info', 'Email change requested', { userId });
	return {
		newEmail: normalizedNewEmail,
		oldEmail: user.email,
		success: true,
		token,
	};
}

type ConfirmEmailChangeResult =
	| {
			reason: typeof SERVICE_ERRORS.EMAIL_TAKEN | typeof SERVICE_ERRORS.TOKEN_INVALID;
			success: false;
	  }
	| { success: true; userId: number };

/**
 * Confirm a pending email change using the one-time token delivered to the new address.
 * On success, updates `users.email`, sets `emailVerified = true` (address is proven reachable),
 * consumes the token, and revokes all user sessions.
 *
 * @param token - Plaintext confirmation token from the email link
 * @returns Result describing success (with userId) or reason for rejection
 */
function confirmEmailChange(token: string): ConfirmEmailChangeResult {
	const db = getDb();
	const config = getConfig();
	const tokenHash = createHash('sha256').update(token).digest('hex');

	const record = db
		.select()
		.from(emailChangeTokens)
		.where(
			and(eq(emailChangeTokens.tokenHash, tokenHash), isNull(emailChangeTokens.consumedAt))
		)
		.get();

	if (!record) {
		logAuth('debug', 'Email change confirm failed: token not found');
		return { reason: SERVICE_ERRORS.TOKEN_INVALID, success: false };
	}

	if (record.expiresAt < new Date()) {
		logAuth('debug', 'Email change confirm failed: token expired', { userId: record.userId });
		return { reason: SERVICE_ERRORS.TOKEN_INVALID, success: false };
	}

	const user = db.select().from(users).where(eq(users.id, record.userId)).get();
	if (!user || user.isDeleted) {
		logAuth('debug', 'Email change confirm failed: user missing', { userId: record.userId });
		return { reason: SERVICE_ERRORS.TOKEN_INVALID, success: false };
	}

	const collision = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.email, record.newEmail), eq(users.isDeleted, false)))
		.get();
	if (collision && collision.id !== record.userId) {
		logAuth('warn', 'Email change confirm failed: address taken since request', {
			userId: record.userId,
		});
		db.transaction((tx) => {
			tx.update(emailChangeTokens)
				.set({ consumedAt: new Date() })
				.where(eq(emailChangeTokens.id, record.id))
				.run();
		});
		return { reason: SERVICE_ERRORS.EMAIL_TAKEN, success: false };
	}

	db.transaction((tx) => {
		tx.update(users)
			.set({
				email: record.newEmail,
				emailVerified: true,
				updatedAt: new Date(),
			})
			.where(eq(users.id, record.userId))
			.run();
		tx.update(emailChangeTokens)
			.set({ consumedAt: new Date() })
			.where(eq(emailChangeTokens.id, record.id))
			.run();
	});

	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	revokeAllUserTokens(record.userId, new Date(Date.now() + refreshTtlMs));

	logAuth('info', 'Email change confirmed', { userId: record.userId });
	return { success: true, userId: record.userId };
}

export { confirmEmailChange, requestEmailChange };
