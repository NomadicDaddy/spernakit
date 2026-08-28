#!/usr/bin/env bun
/**
 * Regression coverage for the onboarding password step
 * (`.aidd/features/remediation-20260827-onboarding-affirms-an-unperformed-password-change`).
 *
 * The defect this gate was written for: the checklist's first step read "Sign in as administrator /
 * Log in with the default sysop account and change the default password" and was hard-coded
 * `completed: true`. Signing in is what made it true, so the checklist affirmed a password change
 * that nobody had performed, on the one account whose default password is published in the
 * project's own documentation.
 *
 * The property under test is that the step reports on state the database actually holds. Both
 * scenarios below therefore read the step twice, on either side of a real password change driven
 * through `changeUserPassword`, rather than asserting the text of a step that never moves.
 *
 * Runs in process against throwaway temp-file SQLite databases:
 *  1. The default install, with "Require Password Change on First Login" off. A freshly seeded
 *     sysop has `passwordChangedAt` null, and the step must be open. Changing the password closes
 *     it. The sign-in step must no longer claim anything about a password.
 *  2. The same toggle turned on and the database re-seeded, which is what reset.ps1 does. The guard
 *     blocks every non-exempt request while the change is outstanding, and the checklist has to
 *     agree with it: open while the guard holds, complete once the change releases it.
 *  3. An administrator reset on that same account, which stamps `passwordChangedAt` while handing
 *     the holder a password they did not choose. The step reopens on `requiresPasswordChange`,
 *     which is the half of the predicate a timestamp check on its own cannot cover.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OnboardingStep } from '../backend/src/services/onboardingService.ts';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { changeUserPassword, updateAuthSettings } from '../backend/src/services/authService.ts';
import {
	getDefaultOnboardingSteps,
	getOnboardingStatus,
	getPasswordChangeStep,
} from '../backend/src/services/onboardingService.ts';
import { adminResetUserPassword } from '../backend/src/services/userService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STEP_ID = 'change-sysop-password';
/** Low bcrypt cost: this gate hashes a dozen passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
const NEW_PASSWORD = 'Chosen-By-The-Owner-9!';
const ADMIN_SET_PASSWORD = 'Handed-Over-By-Admin-7!';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

type App = ReturnType<typeof createApiApp>;
type SeededUser = typeof users.$inferSelect;

/**
 * The seed's own SYSOP account and its development password.
 *
 * Read out of SEED_USERS rather than written down here, so a derived app that renames its SYSOP
 * account moves this gate with it instead of silently testing a row that no longer exists.
 */
function sysopSeed(): { password: string; username: string } {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === 'SYSOP');
	if (!seed) throw new Error('SEED_USERS carries no SYSOP account');
	return { password: seed.password, username: seed.username };
}

function requireSysop(): SeededUser {
	const { username } = sysopSeed();
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === username);
	if (!row) throw new Error(`the seed produced no ${username} account`);
	return row;
}

function openDatabase(): string {
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-onboarding-password-'));
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

/** Run the real seed, which is what reads the password-change toggle. */
async function seedAccounts(): Promise<void> {
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
}

function statusRequest(app: App, sysop: SeededUser): Promise<Response> {
	const config = getConfig();
	const token = signAccessToken({ id: sysop.id, role: 'SYSOP' });
	return app.handle(
		new Request('http://localhost/api/v1/onboarding/status', {
			headers: {
				cookie: `${config.security.authCookieName}=${token}`,
				origin: config.server.frontendUrl,
			},
			method: 'GET',
		}),
	);
}

/** The checklist as the signed-in sysop sees it. */
async function readSteps(app: App, sysop: SeededUser): Promise<OnboardingStep[]> {
	const response = await statusRequest(app, sysop);
	const payload = (await response.json()) as { data?: { steps?: OnboardingStep[] } };
	if (response.status !== 200) {
		throw new Error(
			`reading the onboarding status: ${String(response.status)} ${JSON.stringify(payload)}`,
		);
	}
	return payload.data?.steps ?? [];
}

function stepOf(steps: OnboardingStep[], id: string): OnboardingStep | undefined {
	return steps.find((step) => step.id === id);
}

/** Scenario 1: the default install, with the password-change toggle off. */
async function defaultInstall(): Promise<void> {
	const tmpDir = openDatabase();
	await seedAccounts();
	const sysop = requireSysop();
	assert(
		sysop.passwordChangedAt === null,
		'a freshly seeded sysop must carry no password-change timestamp, or this gate proves nothing',
	);
	assert(
		!sysop.requiresPasswordChange,
		'with the toggle off the seed must not force a change, which is the state the defect shipped in',
	);

	const app = createApiApp();
	const before = await readSteps(app, sysop);
	const step = stepOf(before, STEP_ID);
	assert(
		step !== undefined,
		`the checklist must carry a ${STEP_ID} step; it held ${JSON.stringify(before.map((one) => one.id))}`,
	);
	assert(
		step?.completed === false,
		'a sysop still on its seeded password must not be told the change is already done',
	);

	const login = stepOf(before, 'login');
	assert(
		login !== undefined && !/password/i.test(`${login.title} ${login.description}`),
		`the sign-in step must not report on a password change it does not observe; it said ${JSON.stringify(login)}`,
	);

	assert(
		JSON.stringify(stepOf(getDefaultOnboardingSteps(), STEP_ID)) ===
			JSON.stringify(getPasswordChangeStep()),
		'the baseline list must compose getPasswordChangeStep(), so an app writing its own steps can include it without reimplementing the query',
	);

	const changed = await changeUserPassword(sysop.id, sysopSeed().password, NEW_PASSWORD);
	assert(changed.success, `changing the sysop password: ${changed.error ?? 'refused'}`);

	const after = await readSteps(app, sysop);
	assert(
		stepOf(after, STEP_ID)?.completed === true,
		'once the password has actually been changed the step must report complete',
	);
	await teardown(tmpDir);
}

/** Scenario 2: "Require Password Change on First Login" turned on, then the database re-seeded. */
async function toggleOn(): Promise<void> {
	const tmpDir = openDatabase();
	await seedAccounts();
	updateAuthSettings({ requirePasswordChange: true }, requireSysop().id);
	/*
	 * seedUsersIfEmpty only runs on an empty table and reads the toggle at seed time, so the flow
	 * being reproduced here is the real one: turn the setting on, then reset the database.
	 */
	getDb().delete(users).run();
	await seedAccounts();

	const sysop = requireSysop();
	assert(
		sysop.requiresPasswordChange,
		'with the toggle on the seed must force a password change, or the agreement below is untested',
	);

	const app = createApiApp();
	const blocked = await statusRequest(app, sysop);
	assert(
		blocked.status === 403,
		`the guard must hold every non-exempt request while a change is forced, got ${String(blocked.status)}`,
	);
	/*
	 * The guard is holding, so the checklist cannot be read over HTTP in this state. Read it in
	 * process instead: what matters is that the two mechanisms answer the same way about the same
	 * account, not which transport carried the answer.
	 */
	assert(
		stepOf(getOnboardingStatus().steps, STEP_ID)?.completed === false,
		'while the guard forces a change, the checklist must agree that the change is outstanding',
	);

	const changed = await changeUserPassword(sysop.id, sysopSeed().password, NEW_PASSWORD);
	assert(changed.success, `changing the sysop password: ${changed.error ?? 'refused'}`);

	const released = await readSteps(app, sysop);
	assert(
		stepOf(released, STEP_ID)?.completed === true,
		'the guard and the checklist must release together, on the same password change',
	);

	/*
	 * An administrator reset moves passwordChangedAt but hands the account a password its holder
	 * did not choose, and raises requiresPasswordChange to say so. The step has to reopen on that
	 * flag alone, which is the half of the predicate the timestamp cannot cover. Read the checklist
	 * in process here: adminResetUserPassword does not clear the guard's own flag cache, so the
	 * guard can lag by up to its TTL while the database already says the change is outstanding.
	 */
	const admin = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.role === 'ADMIN');
	if (!admin) throw new Error('the seed produced no ADMIN account');
	const reset = await adminResetUserPassword(admin.id, sysop.id, {
		mode: 'set',
		password: ADMIN_SET_PASSWORD,
	});
	assert(
		reset.success,
		`an administrator resetting the sysop password: ${reset.error ?? 'refused'}`,
	);
	const afterReset = requireSysop();
	assert(
		afterReset.passwordChangedAt !== null && afterReset.requiresPasswordChange,
		'the reset must leave a timestamp behind and force a change, or the assertion below is not testing requiresPasswordChange',
	);
	assert(
		stepOf(getOnboardingStatus().steps, STEP_ID)?.completed === false,
		'after an administrator reset the sysop is on a password it did not choose, so the step must open again',
	);
	await teardown(tmpDir);
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;
	config.audit.enabled = false;

	await defaultInstall();
	await toggleOn();

	if (failures.length === 0) {
		console.log(
			'[OK] onboarding-password-step: the checklist reports the sysop password change from the database, with the toggle off and on',
		);
		process.exit(0);
	}
	console.error('[FAIL] onboarding-password-step:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-onboarding-password-step:', err);
	process.exit(1);
});
