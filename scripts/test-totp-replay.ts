#!/usr/bin/env bun
/**
 * Gate: an accepted TOTP code consumes its 30-second time step, so the same code can't be used
 * again while it is still valid (audit-security-1792503686-successful-totp-codes-remain-reusable-during-their-validity-window).
 *
 * The defect: verification checked only that a code was mathematically valid and never recorded
 * which time step it had used, so a captured MFA challenge and code could open further sessions,
 * and pass the MFA lifecycle checks, for as long as the code stayed valid.
 *
 * Runs in-process against a throwaway temp-file SQLite database through the real service
 * functions (setupMfa, verifySetup, verifyCode, regenerateRecoveryCodes, disableMfa). Codes come
 * from an independent RFC 6238 implementation (scripts/lib/totp-replay-races.ts). It checks:
 *  1. the code that enables MFA can't then pass the login challenge;
 *  2. a later step's code is accepted once, and its replay is refused;
 *  3. two concurrent requests with one code: exactly one is accepted;
 *  4. a code inside the accepted skew window (the next step) works once;
 *  5. a code of an earlier step than the last accepted one is refused;
 *  6. the lifecycle checks (regenerate recovery codes, disable MFA) refuse a used code and accept
 *     a fresh one, and a refused disable leaves MFA enabled;
 *  7. the enrollment state-transition fixtures in scripts/lib/totp-replay-races.ts: each check
 *     and write applies only to the exact enrollment it read, and a lost write is a refusal.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { getAppSlug, loadDefaults } from '../backend/src/config/configUtils.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, eq, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { mfaSettings } from '../backend/src/db/schema/mfaSettings.ts';
import { users } from '../backend/src/db/schema/users.ts';
import {
	disableMfa,
	regenerateRecoveryCodes,
	setupMfa,
	verifyCode,
	verifySetup,
} from '../backend/src/services/auth/mfaService.ts';
import {
	base32Decode,
	checkEnrollmentRaces,
	PERIOD_MS,
	totpCode,
} from './lib/totp-replay-races.ts';

const repoRoot = resolve(import.meta.dir, '..');
const USER_ID = 7;
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

// A throwaway config from defaults, with the app's environment overrides dropped, so the
// checkout's config can't change the result behind the step's cache key.
const envPrefix = `${getAppSlug(loadDefaults()).toUpperCase().replace(/-/g, '_')}_`;
for (const name of Object.keys(process.env)) {
	if (name.toUpperCase().startsWith(envPrefix)) delete process.env[name];
}
const configDir = mkdtempSync(join(tmpdir(), 'spernakit-totp-replay-config-'));
try {
	initializeConfig(configDir);
} finally {
	rmSync(configDir, { force: true, recursive: true });
}
// A fixed test key for the encrypted secret; never a real one.
getConfig().security.encryptionKey = '10'.repeat(32);

// Start well inside a time step, so the steps the checks name can't move under them: every
// check, the enrollment fixtures included, runs in well under the 20 s left.
const intoStep = Date.now() % PERIOD_MS;
if (intoStep > PERIOD_MS - 20_000) await Bun.sleep(PERIOD_MS - intoStep + 200);
const now = Date.now();

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-totp-replay-'));
try {
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	getDb()
		.insert(users)
		.values({
			email: 'mfa@example.com',
			id: USER_ID,
			passwordHash: 'x',
			role: 'OPERATOR',
			username: 'mfa',
		})
		.run();

	const { secret } = await setupMfa(USER_ID);
	const key = base32Decode(secret);
	const codeAt = (stepOffset: number): string =>
		totpCode(key, Math.floor(now / PERIOD_MS) + stepOffset);

	// 1. The previous step's code (inside the skew window) enables MFA, and is then used up.
	const enabled = await verifySetup(USER_ID, codeAt(-1));
	assert(enabled?.success === true, 'the setup code enables MFA');
	assert(
		!(await verifyCode(USER_ID, codeAt(-1))),
		'the code that enabled MFA is refused at login',
	);

	// 2. The current step's code is accepted once; its replay is refused.
	assert(await verifyCode(USER_ID, codeAt(0)), "the current step's code is accepted");
	assert(!(await verifyCode(USER_ID, codeAt(0))), 'replaying the same code is refused');

	// 3. Two concurrent requests with the next step's code: exactly one wins.
	const raced = await Promise.all([
		verifyCode(USER_ID, codeAt(1)),
		verifyCode(USER_ID, codeAt(1)),
	]);
	assert(
		raced.filter(Boolean).length === 1,
		`one of two concurrent uses wins, got ${JSON.stringify(raced)}`,
	);

	// 4 and 5. The next step's code (skew window) has now been used; an earlier step is refused.
	assert(!(await verifyCode(USER_ID, codeAt(1))), 'the skew-window code is refused once used');
	assert(!(await verifyCode(USER_ID, codeAt(-1))), "an earlier step's code is refused");
	const row = getDb().select().from(mfaSettings).where(eq(mfaSettings.userId, USER_ID)).get();
	assert(
		row?.lastAcceptedTotpStep === Math.floor(now / PERIOD_MS) + 1,
		'the last accepted step is recorded',
	);

	// 6. Lifecycle checks share the consuming verifier. All three steps in the window are used,
	// so every code is refused, and a refused disable leaves MFA on.
	assert(
		(await regenerateRecoveryCodes(USER_ID, codeAt(1))) === null,
		'regenerating recovery codes refuses a used code',
	);
	assert(!(await disableMfa(USER_ID, codeAt(0))), 'disabling MFA refuses a used code');
	const still = getDb().select().from(mfaSettings).where(eq(mfaSettings.userId, USER_ID)).get();
	assert(still?.isEnabled === true, 'a refused disable leaves MFA enabled');
	// A fresh step is accepted: clear the record of the window's steps to stand in for time passing.
	getDb()
		.update(mfaSettings)
		.set({ lastAcceptedTotpStep: Math.floor(now / PERIOD_MS) - 5 })
		.where(eq(mfaSettings.userId, USER_ID))
		.run();
	assert(
		(await regenerateRecoveryCodes(USER_ID, codeAt(0))) !== null,
		'a fresh code regenerates recovery codes',
	);
	assert(await disableMfa(USER_ID, codeAt(1)), 'a fresh code disables MFA');

	// 7. Enrollment state transitions between each check's read and its write.
	await checkEnrollmentRaces(assert, now);
} catch (err) {
	// Report it with the failures already collected, rather than losing them to the throw.
	failures.push(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}
}

if (failures.length > 0) {
	console.error(`totp replay: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('totp replay: all checks passed');
