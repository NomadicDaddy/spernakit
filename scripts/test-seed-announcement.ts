#!/usr/bin/env bun
/**
 * Gate: the production seed's notice agrees with the password-change flags it seeds
 * (`.aidd/features/seed-password-change-enforcement`, criterion 13).
 *
 * The defect: backend/src/db/seed.ts always announced "All accounts require password change on
 * first login", while seedUsersIfEmpty sets requiresPasswordChange from the auth-settings toggle,
 * which is off by default. The fix is announcement-only; account flags and databases are unchanged.
 *
 *  1. productionSeedNotice carries the mandatory-change sentence only when the toggle is on, and
 *     always keeps the save-credentials warning.
 *  2. Against throwaway SQLite databases, for the toggle off and on: the real seed's account flags
 *     and the notice built from the same effective setting agree.
 *  3. A second seed over an already-seeded database creates nothing and leaves the flags as they
 *     were.
 *  4. seed.ts builds its notice from the effective toggle and carries no unconditional sentence.
 *     The same check run on a copy with the old unconditional notice restored must fail, which
 *     proves it can see the defect.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { productionSeedNotice } from '../backend/src/db/seedCredentialDisplay.ts';
import { getAuthSettings, updateAuthSettings } from '../backend/src/services/authService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = resolve(import.meta.dir, '..');
const MANDATORY = 'All accounts require password change on first login.';
const SAVE = 'Save the displayed production credentials now';
/** Low bcrypt cost: this gate seeds accounts twice per scenario and is not measuring the hash. */
const SEED_ROUNDS = 4;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** Wiring failures in a seed.ts source: what check 4 asserts, as data so it can be controlled. */
function seedWiringFailures(source: string): string[] {
	const found: string[] = [];
	if (!source.includes('productionSeedNotice(getAuthSettings().requirePasswordChange)')) {
		found.push('seed.ts does not build its notice from the effective requirePasswordChange');
	}
	if (source.includes('All accounts require password change')) {
		found.push('seed.ts carries the mandatory-change sentence outside productionSeedNotice');
	}
	return found;
}

function openDatabase(): string {
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-seed-announcement-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	return tmpDir;
}

async function teardown(tmpDir: string): Promise<void> {
	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}
}

async function seed(): Promise<boolean> {
	const created = await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	return created !== null;
}

async function scenario(toggle: boolean): Promise<void> {
	const label = `toggle ${toggle ? 'on' : 'off'}`;
	const tmpDir = openDatabase();
	try {
		// The settings row records who changed it, so an account must exist first; then reset the
		// users table so the real seed runs again under the chosen toggle, as reset does.
		await seed();
		const first = getDb().select().from(users).all()[0];
		if (!first) throw new Error('the seed created no accounts');
		updateAuthSettings({ requirePasswordChange: toggle }, first.id);
		getDb().delete(users).run();
		assert(await seed(), `${label}: the seed creates accounts on an empty table`);

		const seeded = getDb().select().from(users).all();
		assert(seeded.length > 0, `${label}: seeded accounts exist`);
		assert(
			seeded.every((user) => user.requiresPasswordChange === toggle),
			`${label}: every seeded account has requiresPasswordChange=${String(toggle)}`,
		);
		const notice = productionSeedNotice(getAuthSettings().requirePasswordChange);
		assert(
			notice.includes(MANDATORY) === toggle,
			`${label}: the notice ${toggle ? 'states' : 'omits'} the mandatory-change sentence`,
		);
		assert(notice.includes(SAVE), `${label}: the notice keeps the save-credentials warning`);

		// 3. Existing databases are untouched by a rerun.
		assert(!(await seed()), `${label}: a seed over existing accounts creates nothing`);
		const after = getDb().select().from(users).all();
		assert(
			after.length === seeded.length &&
				after.every((user) => user.requiresPasswordChange === toggle),
			`${label}: a rerun leaves the existing accounts and their flags as they were`,
		);
	} finally {
		await teardown(tmpDir);
	}
}

async function run(): Promise<void> {
	// 1. The notice itself.
	assert(productionSeedNotice(true).includes(MANDATORY), 'toggle on: the sentence is present');
	assert(!productionSeedNotice(false).includes(MANDATORY), 'toggle off: the sentence is absent');
	assert(
		productionSeedNotice(true).includes(SAVE) && productionSeedNotice(false).includes(SAVE),
		'the save-credentials warning is present in both states',
	);

	// 2 and 3. Flags and notice agree under both toggle states.
	initializeConfig();
	const config = getConfig();
	applyEphemeralAuthKeys(config.security);
	config.audit.enabled = false;
	await scenario(false);
	await scenario(true);

	// 4. seed.ts wiring, with its negative control.
	const seedSource = readFileSync(join(repoRoot, 'backend', 'src', 'db', 'seed.ts'), 'utf8');
	const wiring = seedWiringFailures(seedSource);
	assert(wiring.length === 0, `seed.ts wiring: ${wiring.join('; ')}`);
	const restored = seedSource.replace(
		'productionSeedNotice(getAuthSettings().requirePasswordChange)',
		`'IMPORTANT: Save the displayed production credentials now. ${MANDATORY}'`,
	);
	assert(
		restored !== seedSource && seedWiringFailures(restored).length > 0,
		'negative control: restoring the unconditional notice fails the wiring check',
	);

	if (failures.length > 0) {
		console.error(`[FAIL] test:seed-announcement (${failures.length})`);
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}
	console.log(
		'[PASS] test:seed-announcement: notice and seeded flags agree with the toggle off and on',
	);
	process.exit(0);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-seed-announcement:', err);
	process.exit(1);
});
