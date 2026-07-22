import { eq, sql } from 'drizzle-orm';

import type { users as usersSchema } from '../../db/schema/users.ts';
import type { AuthPayload } from '../../plugins/auth.ts';

import { MS_PER_MINUTE } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { validateUserRole } from '../../types/roles.ts';
import { logAuth } from '../../utils/logger.ts';
import { hashPassword, verifyPassword } from './authCore.ts';
import { getAuthSettings, isPasswordExpired } from './authSecurityService.ts';

/**
 * Bcrypt hash used for timing normalization when the user is not found.
 * Generated lazily (once) via hashPassword so its cost factor always matches
 * config.security.bcryptRounds — a hardcoded $2b$12$ hash would only equalize
 * timing when bcryptRounds happens to be 12.
 */
let dummyHashPromise: null | Promise<string> = null;

function getDummyHash(): Promise<string> {
	dummyHashPromise ??= hashPassword('timing-normalization-dummy-password');
	return dummyHashPromise;
}

interface LoginResult {
	email: string;
	payload: AuthPayload;
	requiresPasswordChange: boolean;
	username: string;
}

type LoginFailureReason = 'deleted' | 'expired' | 'invalid' | 'locked';

interface LoginFailure {
	email?: string;
	reason: LoginFailureReason;
}

type LoginResponse = LoginFailure | LoginResult;

/**
 * Type guard that narrows a LoginResponse to LoginResult on success.
 *
 * @param result - Login response to check
 * @returns True if the response contains a successful login payload
 */
function isLoginSuccess(result: LoginResponse): result is LoginResult {
	return 'payload' in result;
}

type UserRow = typeof usersSchema.$inferSelect;

type EligibilityResult =
	{ eligible: false; email?: string; reason: LoginFailureReason } | { eligible: true };

/**
 * Check whether a user account is eligible to complete login.
 * Rejects deleted accounts, locked accounts (within lockout window),
 * and accounts with expired passwords.
 *
 * @param user - User row from database
 * @param authSettings - Current authentication security settings
 * @returns Eligibility result with failure reason when ineligible
 */
function validateLoginEligibility(user: UserRow): EligibilityResult {
	if (user.isDeleted) {
		logAuth('debug', 'Login failed: user is deleted', { username: user.username });
		return { eligible: false, reason: 'deleted' };
	}

	if (user.lockedUntil && user.lockedUntil > new Date()) {
		logAuth('debug', 'Login failed: account locked', { username: user.username });
		return { eligible: false, email: user.email, reason: 'locked' };
	}

	if (isPasswordExpired(user.passwordChangedAt)) {
		logAuth('debug', 'Login failed: password expired', { username: user.username });
		return { eligible: false, email: user.email, reason: 'expired' };
	}

	return { eligible: true };
}

/**
 * Record a failed login attempt and apply account lockout if threshold is reached.
 * Uses atomic SQL increment to prevent race conditions with concurrent attempts.
 * Skips accumulation if account is already locked to prevent indefinite lockout DoS.
 *
 * @param user - User row from database
 * @returns Login failure with appropriate reason (invalid or locked)
 */
function recordFailedLogin(user: UserRow): LoginFailure {
	// If account is already locked, do not accumulate further failed attempts
	// or reset the lock timer — this prevents indefinite lockout DoS
	if (user.lockedUntil && user.lockedUntil > new Date()) {
		logAuth('debug', 'Login failed: account locked', { username: user.username });
		return { email: user.email, reason: 'locked' };
	}

	const db = getDb();
	const authSettings = getAuthSettings();

	// Wrap the atomic increment and the conditional lockout in a single transaction
	// so a concurrent attempt cannot observe the post-increment attempt count before
	// the lockout takes effect (which would otherwise allow one extra attempt past
	// the configured threshold).
	const { newAttempts, shouldLock } = db.transaction((tx) => {
		const updated = tx
			.update(users)
			.set({
				failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id))
			.returning({ failedLoginAttempts: users.failedLoginAttempts })
			.get();

		const attempts = updated?.failedLoginAttempts ?? user.failedLoginAttempts + 1;
		const lock = authSettings.enableAccountLocking && attempts >= authSettings.maxLoginAttempts;

		if (lock) {
			const lockout = new Date(
				Date.now() + authSettings.lockoutDurationMinutes * MS_PER_MINUTE
			);
			tx.update(users).set({ lockedUntil: lockout }).where(eq(users.id, user.id)).run();
		}

		return { newAttempts: attempts, shouldLock: lock };
	});

	logAuth('debug', 'Login failed: wrong password', {
		attempts: newAttempts,
		username: user.username,
	});

	if (shouldLock) {
		return { email: user.email, reason: 'locked' };
	}
	return { reason: 'invalid' };
}

/**
 * Record a successful login by resetting failure counters and updating tracking fields.
 * Clears failed attempts, lockout, and any outstanding password reset token.
 *
 * @param userId - ID of the authenticated user
 * @param ip - Client IP address for login tracking
 */
function recordSuccessfulLogin(userId: number, ip: string): void {
	const db = getDb();
	db.update(users)
		.set({
			failedLoginAttempts: 0,
			lastLoginAt: new Date(),
			lastLoginIp: ip,
			lockedUntil: null,
			// Invalidate any outstanding password reset token (defense-in-depth)
			resetToken: null,
			resetTokenExpiresAt: null,
			updatedAt: new Date(),
		})
		.where(eq(users.id, userId))
		.run();
}

/**
 * Authenticate a user by username/email and password.
 * Returns LoginResult on success, or LoginFailure with reason on failure.
 * Updates login tracking fields (lastLoginAt, lastLoginIp, failedLoginAttempts).
 *
 * Failure reasons:
 * - 'deleted': User account is soft-deleted
 * - 'expired': Password has exceeded expiry period
 * - 'invalid': User not found or wrong password (intentionally indistinguishable)
 * - 'locked': Account is temporarily locked due to too many failed attempts
 *
 * @param usernameOrEmail - Username or email address
 * @param password - Plaintext password
 * @param ip - Client IP address for login tracking
 * @returns LoginResponse with success payload or failure reason
 */
async function login(
	usernameOrEmail: string,
	password: string,
	ip: string
): Promise<LoginResponse> {
	const db = getDb();

	const user = db
		.select()
		.from(users)
		.where(
			usernameOrEmail.includes('@')
				? eq(users.email, usernameOrEmail)
				: eq(users.username, usernameOrEmail)
		)
		.get();

	if (!user) {
		await verifyPassword(password, await getDummyHash());
		logAuth('debug', 'Login failed: user not found', { usernameOrEmail });
		return { reason: 'invalid' };
	}

	// Always verify password before checking eligibility to prevent timing
	// side-channels that reveal user status (locked/deleted/expired)
	const passwordValid = await verifyPassword(password, user.passwordHash);

	if (!passwordValid) {
		return recordFailedLogin(user);
	}

	const eligibility = validateLoginEligibility(user);
	if (!eligibility.eligible) {
		return eligibility.email
			? { email: eligibility.email, reason: eligibility.reason }
			: { reason: eligibility.reason };
	}

	recordSuccessfulLogin(user.id, ip);

	const payload: AuthPayload = {
		id: user.id,
		role: validateUserRole(user.role),
	};

	return {
		email: user.email,
		payload,
		requiresPasswordChange: user.requiresPasswordChange,
		username: user.username,
	};
}

export {
	isLoginSuccess,
	login,
	type LoginFailure,
	type LoginFailureReason,
	type LoginResponse,
	type LoginResult,
	recordSuccessfulLogin,
};
