#!/usr/bin/env bun
/**
 * Regression gate for the password-reset claim (audit record audit-security-1792503686, its
 * transaction-predicate and expiry-race residuals).
 *
 * resetPassword reads the user by reset token and checks expiry and deletion, then awaits the
 * password-history check and hashing before the consuming transaction. Anything that changes
 * in that window must make the claim fail rather than be overwritten. Each case starts a real
 * resetPassword call, changes the row while the call is inside its awaited work (the token
 * SELECT runs synchronously before the first await, so the change lands after it), and then
 * requires the reset to fail with the row keeping the concurrent change:
 *   - the token expires;
 *   - the account is deleted;
 *   - the password is changed elsewhere (the history check read a stale hash);
 *   - the token is replaced by a newer reset.
 * Positive control: an untouched reset succeeds, writes the new hash and clears the token.
 * Concurrent use of one token: exactly one of two simultaneous resets succeeds.
 *
 * Run: bun scripts/test-password-reset-consumption.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
// eq comes through the DB surface module: this script resolves dependencies from the root
// manifest, which does not carry drizzle-orm.
import { closeDatabase, eq, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { resetPassword } from '../backend/src/services/auth/authPasswordReset.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

type UserRow = typeof users.$inferSelect;
type UserChange = Partial<
	Pick<UserRow, 'isDeleted' | 'passwordHash' | 'resetToken' | 'resetTokenExpiresAt'>
>;

const repoRoot = join(import.meta.dir, '..');
const failures: string[] = [];
const ORIGINAL_HASH = 'not-a-real-hash';
let seq = 0;

/** Insert a user holding a live reset token; returns its id and the plaintext token. */
function seedUser(): { id: number; token: string } {
	seq += 1;
	const token = randomBytes(32).toString('hex');
	const row = getDb()
		.insert(users)
		.values({
			email: `reset${String(seq)}@fixture.invalid`,
			passwordHash: ORIGINAL_HASH,
			resetToken: createHash('sha256').update(token).digest('hex'),
			resetTokenExpiresAt: new Date(Date.now() + 60_000),
			role: 'OPERATOR',
			username: `resetfixture${String(seq)}`,
		})
		.returning({ id: users.id })
		.get();
	return { id: row.id, token };
}

function readUser(id: number): UserRow {
	const row = getDb().select().from(users).where(eq(users.id, id)).get();
	if (!row) throw new Error(`fixture user ${String(id)} vanished`);
	return row;
}

/** Start a reset, apply `change` while it is inside its awaited work, then settle it. */
async function resetWithChange(change: UserChange): Promise<{ after: UserRow; ok: boolean }> {
	const { id, token } = seedUser();
	const pending = resetPassword(token, `Fresh${String(seq)}Password!x`);
	getDb()
		.update(users)
		.set({ ...change, updatedAt: new Date() })
		.where(eq(users.id, id))
		.run();
	const result = await pending;
	return { after: readUser(id), ok: result.success };
}

initializeConfig();
const config = getConfig();
applyEphemeralAuthKeys(config.security);
config.rateLimit.enabled = false;
config.rateLimit.authEnabled = false;

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-reset-consumption-'));
try {
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));

	const control = await resetWithChange({});
	if (!control.ok) failures.push('control: an untouched reset must succeed');
	if (control.after.passwordHash === ORIGINAL_HASH)
		failures.push('control: a successful reset must write the new password hash');
	if (control.after.resetToken !== null)
		failures.push('control: a successful reset must clear the token');

	const expired = await resetWithChange({ resetTokenExpiresAt: new Date(Date.now() - 1000) });
	if (expired.ok) failures.push('a token that expires during hashing must not be consumed');
	if (expired.after.passwordHash !== ORIGINAL_HASH)
		failures.push('an expired claim must leave the password hash unchanged');

	const deleted = await resetWithChange({ isDeleted: true });
	if (deleted.ok) failures.push('an account deleted during hashing must not be reset');
	if (deleted.after.passwordHash !== ORIGINAL_HASH)
		failures.push('a deleted account must keep its password hash');

	const changedElsewhere = 'changed-elsewhere-hash';
	const changed = await resetWithChange({ passwordHash: changedElsewhere });
	if (changed.ok) failures.push('a password changed during hashing must not be overwritten');
	if (changed.after.passwordHash !== changedElsewhere)
		failures.push('the concurrent password change must survive the stale reset');

	const newerToken = createHash('sha256').update(randomBytes(32)).digest('hex');
	const replaced = await resetWithChange({ resetToken: newerToken });
	if (replaced.ok) failures.push('a token replaced during hashing must not be consumed');
	if (replaced.after.resetToken !== newerToken)
		failures.push('the newer reset token must survive the stale reset');

	const { id: raceId, token: raceToken } = seedUser();
	const race = await Promise.all([
		resetPassword(raceToken, 'RaceOne1!password'),
		resetPassword(raceToken, 'RaceTwo2!password'),
	]);
	const winners = race.filter((result) => result.success).length;
	if (winners !== 1)
		failures.push(`concurrent use of one token: expected 1 success, got ${String(winners)}`);
	if (readUser(raceId).resetToken !== null)
		failures.push('concurrent use of one token: the winner must clear the token');
} finally {
	closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows can hold the sqlite file handle briefly after close; the OS temp cleaner
		// owns the directory from here (as test-security-fixes.ts does).
	}
}

if (failures.length > 0) {
	console.error('[FAIL] password-reset consumption:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	'[OK] password-reset consumption: 6 cases (control, expiry, deletion, password change, token replacement, concurrent use)',
);
