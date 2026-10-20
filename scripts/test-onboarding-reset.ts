#!/usr/bin/env bun
/**
 * Regression coverage for onboarding completion and reset reading their own writes.
 *
 * The defect this gate was written for: `completeOnboarding` and `resetOnboarding` wrote the
 * onboarding settings rows directly, while `getOnboardingStatus` read them through `getByKeys`,
 * which serves rows from the settings cache for five minutes. Nothing dropped the written keys from
 * that cache, so a reset issued after a completion went on answering `isComplete: true`, with the
 * old `completedAt` and `completedBy`, until the entries expired. The status each function returns
 * is the response body of the request that made the change, so the reset reported itself undone.
 *
 * A second defect sat behind the first. The reset soft-deletes the `completedAt` and `completedBy`
 * rows, and the next completion upserted their values without restoring them, so a completion
 * after a reset recorded who and when on rows no read could see.
 *
 * The property under test is that the status returned by each call, and by a separate read
 * straight after it, describes the state that call left in the database. Every assertion follows a
 * read that has already populated the cache, because a cold cache hides the first defect entirely.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import {
	completeOnboarding,
	getOnboardingStatus,
	resetOnboarding,
} from '../backend/src/services/onboardingService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Low bcrypt cost: this gate is not measuring the hash. */
const SEED_ROUNDS = 4;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-onboarding-reset-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	try {
		await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
		const actor = getDb().select().from(users).all()[0];
		if (!actor) throw new Error('the seed produced no account to act as');

		assert(!getOnboardingStatus().isComplete, 'a fresh install reports onboarding complete');

		const completed = completeOnboarding(actor.id);
		assert(completed.isComplete, 'completeOnboarding returned a status that is not complete');
		assert(
			completed.completedBy === actor.id,
			`completeOnboarding returned completedBy ${String(completed.completedBy)}, expected ${String(actor.id)}`,
		);
		assert(completed.completedAt !== null, 'completeOnboarding returned no completedAt');
		// This read is what fills the cache with the completed rows.
		assert(getOnboardingStatus().isComplete, 'a read after completion is not complete');

		const reset = resetOnboarding(actor.id);
		assert(!reset.isComplete, 'resetOnboarding returned a status that is still complete');
		assert(reset.completedAt === null, 'resetOnboarding returned the old completedAt');
		assert(reset.completedBy === null, 'resetOnboarding returned the old completedBy');
		const afterReset = getOnboardingStatus();
		assert(!afterReset.isComplete, 'a read after the reset is still complete');
		assert(afterReset.completedAt === null, 'a read after the reset has the old completedAt');

		const again = completeOnboarding(actor.id);
		assert(again.isComplete, 'completing again after a reset is not complete');
		assert(
			again.completedAt !== null,
			'completing again after a reset recorded no visible completedAt',
		);
		assert(
			again.completedBy === actor.id,
			`completing again after a reset returned completedBy ${String(again.completedBy)}, expected ${String(actor.id)}`,
		);
	} finally {
		await closeDatabase();
		try {
			rmSync(tmpDir, { force: true, recursive: true });
		} catch {
			// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
		}
	}

	if (failures.length === 0) {
		console.log('[OK] onboarding-reset: completion and reset read back their own writes');
		process.exit(0);
	}
	console.error('[FAIL] onboarding-reset:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-onboarding-reset:', err);
	process.exit(1);
});
