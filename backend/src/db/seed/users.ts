import { eq } from 'drizzle-orm';

import type { CreatedUser, SeedDb, SeedUser } from './types.ts';

import { getAuthSettings } from '../../services/authService.ts';
import { logDatabase } from '../../utils/logger.ts';
import { users } from '../schema/users.ts';

async function seedUsersIfEmpty(
	db: SeedDb,
	seedUsers: SeedUser[],
	bcryptRounds: number
): Promise<CreatedUser[] | null> {
	const existingUsers = db.select().from(users).all();
	if (existingUsers.length > 0) {
		logDatabase('info', `Database already has ${existingUsers.length} users. Skipping seed.`);
		return null;
	}

	// requiresPasswordChange follows the active "Require Password Change on First Login"
	// auth security toggle (Settings > Authentication, persisted via authSecurityService).
	// When the toggle is OFF (default), seed users land directly on /dashboard so crawltests
	// and first-login flows aren't blocked. When ON, seed users must change their password.
	// emailVerified is always true so email-verification gates never trip
	// the seeded admin/manager/operator/viewer accounts.
	const requiresPasswordChange = getAuthSettings().requirePasswordChange;

	const createdUsers: CreatedUser[] = [];
	for (const seedUser of seedUsers) {
		const passwordHash = await Bun.password.hash(seedUser.password, {
			algorithm: 'bcrypt',
			cost: bcryptRounds,
		});
		const result = db
			.insert(users)
			.values({
				email: seedUser.email,
				emailVerified: true,
				passwordHash,
				requiresPasswordChange,
				role: seedUser.role,
				username: seedUser.username,
			})
			.returning({ id: users.id, role: users.role, username: users.username })
			.get();
		createdUsers.push(result);
		logDatabase('info', `Created user: ${seedUser.username}`, { role: seedUser.role });
	}

	return createdUsers;
}

/**
 * Re-hash and reset passwords for dev seed users whose accounts still exist.
 *
 * Dev-only safety net for password drift: seedUsersIfEmpty() only runs on an
 * empty users table, so if an admin's hash drifts (e.g. failed login attempts
 * that mutate state, manual tampering, stale DB), the documented admin123 et al
 * would no longer work. This helper restores the documented dev passwords and
 * clears lock-related counters without re-creating users or touching prod.
 *
 * Mirrors seedUsersIfEmpty's policy on requiresPasswordChange: when the
 * "Require Password Change on First Login" auth setting is OFF, the flag is
 * cleared so the dev safety net puts accounts back into a usable state. When
 * ON, the flag is left untouched so an admin who has already cleared it for
 * their account doesn't get re-armed on every dev restart.
 *
 * @param db - Drizzle database handle
 * @param seedUsers - Seed user definitions with documented dev passwords
 * @param bcryptRounds - Bcrypt cost factor
 * @returns Number of users whose passwords were reset
 */
async function resetDevSeedPasswords(
	db: SeedDb,
	seedUsers: SeedUser[],
	bcryptRounds: number
): Promise<number> {
	const clearRequiresPasswordChange = !getAuthSettings().requirePasswordChange;
	let resetCount = 0;
	for (const seedUser of seedUsers) {
		const existing = db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, seedUser.username))
			.get();
		if (!existing) continue;

		const passwordHash = await Bun.password.hash(seedUser.password, {
			algorithm: 'bcrypt',
			cost: bcryptRounds,
		});
		db.update(users)
			.set({
				failedLoginAttempts: 0,
				lockedUntil: null,
				passwordHash,
				...(clearRequiresPasswordChange && { requiresPasswordChange: false }),
			})
			.where(eq(users.id, existing.id))
			.run();
		resetCount++;
	}

	if (resetCount > 0) {
		logDatabase('info', `Dev-mode: reset passwords for ${resetCount} seed users`);
	}
	return resetCount;
}

export { resetDevSeedPasswords, seedUsersIfEmpty };
