#!/usr/bin/env bun
/**
 * Verifies account lockout remains separate from active-session refresh:
 *  1. A refresh token issued before a lock rotates successfully (HTTP 200)
 *     while the account is locked.
 *  2. /auth/refresh does not return AUTH_ACCOUNT_LOCKED.
 *  3. Account lockout rejects new password logins with reason 'locked'.
 *  4. Replaying a rotated refresh token revokes both the original and rotated access tokens.
 *  5. An atomic-rotation collision uses the same non-retryable family compromise boundary.
 *  6. The lockout threshold sits strictly above the per-account login rate
 *     limit (maxLoginAttempts === AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1), so
 *     the rate limit absorbs a bad-password flood before the lock can trip.
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via
 * app.handle(). It needs no live server and is unaffected by the committed dev DB's
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
import { handleRotationCollision } from '../backend/src/routes/auth/refresh.ts';
import { hashPassword } from '../backend/src/services/auth/authCore.ts';
import { login } from '../backend/src/services/auth/authLogin.ts';
import { getAuthSettings } from '../backend/src/services/auth/authSecurityService.ts';
import { hashRefreshToken, storeRefreshTokenHash } from '../backend/src/utils/auth/authHelpers.ts';

function setCookieValue(response: Response, name: string): null | string {
	for (const header of response.headers.getSetCookie()) {
		const match = new RegExp(`^${name}=([^;]*)`).exec(header);
		if (match) return decodeURIComponent(match[1] ?? '');
	}
	return null;
}

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
		}),
	);
	const bodyText = await response.text();

	assert(
		response.status === 200,
		`Expected 200 from /auth/refresh while account locked, got ${response.status} (body: ${bodyText})`,
	);
	assert(
		!bodyText.includes('AUTH_ACCOUNT_LOCKED'),
		'Refresh response must not contain AUTH_ACCOUNT_LOCKED — lockout must not gate refresh',
	);
	assert(
		(response.headers.get('set-cookie') ?? '').includes(cookieName),
		'Refresh must rotate and re-set the refresh cookie on success',
	);
	const rotatedAccess = setCookieValue(response, getConfig().security.authCookieName) ?? '';
	const rotatedRefresh = setCookieValue(response, cookieName) ?? '';
	assert(rotatedAccess !== '', 'successful refresh must return a rotated access token');
	assert(rotatedRefresh !== '', 'successful refresh must return a rotated refresh token');

	// --- Criterion 4: replay compromises the whole family, including access tokens ---
	const replay = await app.handle(
		new Request('http://localhost/api/v1/auth/refresh', {
			headers: {
				cookie: `${cookieName}=${tokens.refreshToken}`,
				origin: getConfig().server.frontendUrl,
			},
			method: 'POST',
		}),
	);
	assert(replay.status === 401, `refresh replay must be non-retryable 401, got ${replay.status}`);
	assert(
		(await replay.text()).includes('AUTH_TOKEN_REVOKED'),
		'replay must name token revocation',
	);
	assert(
		replay.headers.getSetCookie().filter((header) => header.includes('Max-Age=0')).length === 2,
		'family compromise must clear both auth cookies',
	);

	for (const accessToken of [tokens.accessToken, rotatedAccess]) {
		const access = await app.handle(
			new Request('http://localhost/api/v1/auth/me', {
				headers: { cookie: `${getConfig().security.authCookieName}=${accessToken}` },
			}),
		);
		assert(access.status === 401, 'every access token in a compromised family must fail');
	}
	const rotatedRefreshResponse = await app.handle(
		new Request('http://localhost/api/v1/auth/refresh', {
			headers: {
				cookie: `${cookieName}=${rotatedRefresh}`,
				origin: getConfig().server.frontendUrl,
			},
			method: 'POST',
		}),
	);
	assert(rotatedRefreshResponse.status === 401, 'rotated refresh token must fail after replay');

	// --- Criterion 5: an atomic rotation collision invokes the same compromise boundary ---
	const collisionTokens = signTokenPair({ id: VICTIM_ID, role: 'OPERATOR' });
	storeRefreshTokenHash(VICTIM_ID, collisionTokens.refreshToken);
	const collisionSet = { headers: {} as Record<string, number | string> };
	const collisionError = handleRotationCollision(false, VICTIM_ID, collisionSet);
	assert(
		collisionError?.code === 'AUTH_TOKEN_REVOKED',
		'rotation collision must revoke the family',
	);
	assert(
		Array.isArray(collisionSet.headers['set-cookie']),
		'rotation collision must clear both response cookies',
	);
	const collisionAccess = await app.handle(
		new Request('http://localhost/api/v1/auth/me', {
			headers: {
				cookie: `${getConfig().security.authCookieName}=${collisionTokens.accessToken}`,
			},
		}),
	);
	assert(collisionAccess.status === 401, 'collision must revoke earlier access tokens');
	const collisionRefresh = await app.handle(
		new Request('http://localhost/api/v1/auth/refresh', {
			headers: {
				cookie: `${cookieName}=${collisionTokens.refreshToken}`,
				origin: getConfig().server.frontendUrl,
			},
			method: 'POST',
		}),
	);
	assert(collisionRefresh.status === 401, 'collision must revoke the ambiguous refresh token');

	// --- Criterion 3: account lock still protects NEW password logins ---
	const loginResult = await login(VICTIM_USERNAME, VICTIM_PASSWORD, '127.0.0.1');
	assert(
		'reason' in loginResult && loginResult.reason === 'locked',
		`Locked account must still reject new password login (reason 'locked'), got ${JSON.stringify(loginResult)}`,
	);

	// --- Criterion 4: lockout threshold sits strictly above the rate limit ---
	const settings = getAuthSettings();
	assert(
		settings.maxLoginAttempts === AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1,
		`maxLoginAttempts (${settings.maxLoginAttempts}) must equal AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1 (${AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1})`,
	);
	assert(
		settings.maxLoginAttempts > AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
		'Lockout threshold must be strictly above the per-account rate limit',
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
	console.error('Fatal error in test-lockout-refresh:', err);
	process.exit(1);
});
