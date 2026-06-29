#!/usr/bin/env bun
/**
 * Regression test for remediation-20260611-lockout-dos-threshold (option c:
 * decouple account lockout from active session refresh).
 *
 * Proves the targeted-DoS path is closed:
 *  1. A victim's refresh token, issued BEFORE a lock began, still rotates
 *     successfully (HTTP 200) while the account is locked — the attacker can no
 *     longer kill the victim's active session by tripping the lock.
 *  2. /auth/refresh no longer returns AUTH_ACCOUNT_LOCKED.
 *  3. Account lockout still protects NEW password logins (login() returns
 *     reason 'locked' for the locked account), so the lock is not neutered.
 *  4. The lockout threshold sits strictly ABOVE the per-account login rate
 *     limit (maxLoginAttempts === AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1), so
 *     the rate limit absorbs a bad-password flood before the lock can trip.
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via
 * app.handle() — no live server, so it is unaffected by the committed dev DB's
 * migration-journal boot guard (a fresh DB has no journal drift).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS } from '../backend/src/constants/rateLimit.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { signTokenPair } from '../backend/src/plugins/auth.ts';
import { hashPassword } from '../backend/src/services/auth/authCore.ts';
import { login } from '../backend/src/services/auth/authLogin.ts';
import { getAuthSettings } from '../backend/src/services/auth/authSecurityService.ts';
import { hashRefreshToken } from '../backend/src/utils/auth/authHelpers.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VICTIM_ID = 1;
const VICTIM_USERNAME = 'victim';
const VICTIM_EMAIL = 'victim@example.com';
const VICTIM_PASSWORD = 'C0rrectHorse!9';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

async function run(): Promise<void> {
	initializeConfig();
	getConfig().rateLimit.enabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-lockout-test-'));
	const dbPath = join(tmpDir, 'test.db');
	const migrationsDir = join(repoRoot, 'backend', 'drizzle');

	// Apply migrations to a fresh file (its own connection), then open it for the app.
	runAutoMigrations(dbPath, migrationsDir);
	initializeDatabase(dbPath);

	const db = getDb();

	// Issue the victim's refresh token BEFORE the lock — simulating an already
	// authenticated session — then store its hash and lock the account.
	const tokens = signTokenPair({ id: VICTIM_ID, role: 'OPERATOR' });
	const lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // locked for 1 hour

	db.insert(users)
		.values({
			email: VICTIM_EMAIL,
			failedLoginAttempts: 99,
			id: VICTIM_ID,
			lockedUntil,
			passwordHash: await hashPassword(VICTIM_PASSWORD),
			refreshTokenHash: hashRefreshToken(tokens.refreshToken),
			role: 'OPERATOR',
			username: VICTIM_USERNAME,
		})
		.run();

	// --- Criterion 1 & 2: refresh succeeds while locked, never AUTH_ACCOUNT_LOCKED ---
	const app = createApiApp();
	const cookieName = getConfig().security.refreshCookieName;
	const response = await app.handle(
		new Request('http://localhost/api/v1/auth/refresh', {
			headers: {
				cookie: `${cookieName}=${tokens.refreshToken}`,
				// Same-origin POST: the CSRF guard requires an allowed Origin.
				origin: getConfig().server.frontendUrl,
			},
			method: 'POST',
		})
	);
	const bodyText = await response.text();

	assert(
		response.status === 200,
		`Expected 200 from /auth/refresh while account locked, got ${response.status} (body: ${bodyText})`
	);
	assert(
		!bodyText.includes('AUTH_ACCOUNT_LOCKED'),
		'Refresh response must not contain AUTH_ACCOUNT_LOCKED — lockout must not gate refresh'
	);
	assert(
		(response.headers.get('set-cookie') ?? '').includes(cookieName),
		'Refresh must rotate and re-set the refresh cookie on success'
	);

	// --- Criterion 3: account lock still protects NEW password logins ---
	const loginResult = await login(VICTIM_USERNAME, VICTIM_PASSWORD, '127.0.0.1');
	assert(
		'reason' in loginResult && loginResult.reason === 'locked',
		`Locked account must still reject new password login (reason 'locked'), got ${JSON.stringify(loginResult)}`
	);

	// --- Criterion 4: lockout threshold sits strictly above the rate limit ---
	const settings = getAuthSettings();
	assert(
		settings.maxLoginAttempts === AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1,
		`maxLoginAttempts (${settings.maxLoginAttempts}) must equal AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1 (${AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1})`
	);
	assert(
		settings.maxLoginAttempts > AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
		'Lockout threshold must be strictly above the per-account rate limit'
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL/backup file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('✅ lockout/refresh decoupling regression checks passed');
		process.exit(0);
	}
	console.error('❌ lockout/refresh decoupling regression FAILED:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-lockout-refresh-decouple:', err);
	process.exit(1);
});
