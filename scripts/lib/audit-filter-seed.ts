/**
 * Seed-account lookup for the audit-outcome-filter regression.
 *
 * Extracted from test-audit-outcome-filter.ts so the test stays under the 300-line
 * file guideline without deleting named constants (Morticia 8ecec60 Low): the lookup
 * is one cohesive concern - resolve the SYSOP seed account to credentials or row id -
 * shared by the login-attempt and token-signing halves of that test.
 */
import { getDb } from '../../backend/src/db/index.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';

export function sysopSeed(): { password: string; username: string } {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === 'SYSOP');
	if (!seed) throw new Error('SEED_USERS carries no SYSOP account');
	return { password: seed.password, username: seed.username };
}

export function sysopId(): number {
	const { username } = sysopSeed();
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === username);
	if (!row) throw new Error(`the seed produced no ${username} account`);
	return row.id;
}
