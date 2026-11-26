#!/usr/bin/env bun
/**
 * Verifies account lockout remains separate from active-session refresh:
 *  1. A refresh token issued before a lock rotates successfully (HTTP 200)
 *     while the account is locked.
 *  2. /auth/refresh does not return AUTH_ACCOUNT_LOCKED.
 *  3. Account lockout rejects new password logins with reason 'locked'.
 *  4. Replaying a rotated refresh token ends its sign-in and revokes both the original and
 *     rotated access tokens.
 *  5. An atomic-rotation collision uses the same non-retryable family compromise boundary.
 *  6. The lockout threshold sits strictly above the per-account login rate
 *     limit (maxLoginAttempts === AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1), so
 *     one rate-limit window of bad passwords cannot trip the lock.
 *  7. A failure during an active lock leaves the counter alone, and once the lock
 *     has expired one further failure counts as 1 (no re-lock), then the right
 *     password signs in.
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via
 * app.handle(). It needs no live server and is unaffected by the committed dev DB's
 * migration-journal boot guard (a fresh DB has no journal drift).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS } from '../backend/src/constants/rateLimit.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
// eq comes through the DB surface module: this script resolves dependencies from the root
// manifest, which does not carry drizzle-orm.
import { eq, getDb } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { handleRotationCollision } from '../backend/src/routes/auth/refresh.ts';
import { startSignIn } from '../backend/src/routes/auth/session-helpers.ts';
import { hashPassword } from '../backend/src/services/auth/authCore.ts';
import { login } from '../backend/src/services/auth/authLogin.ts';
import { getAuthSettings } from '../backend/src/services/auth/authSecurityService.ts';
import { findRefreshSession } from '../backend/src/utils/auth/refreshSessions.ts';
import { startTempDatabase } from './lib/temp-db-app.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

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
	applyEphemeralAuthKeys(getConfig().security);
	getConfig().rateLimit.enabled = false;

	// Apply migrations to a fresh file (its own connection), then open it for the app.
	const { dispose } = startTempDatabase(repoRoot, 'spernakit-lockout-test-');

	const db = getDb();

	// The victim is already locked; the sign-in below stands for a session that was
	// authenticated before the lock began.
	const lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // locked for 1 hour

	db.insert(users)
		.values({
			email: VICTIM_EMAIL,
			failedLoginAttempts: 99,
			id: VICTIM_ID,
			lockedUntil,
			passwordHash: await hashPassword(VICTIM_PASSWORD),
			role: 'OPERATOR',
			username: VICTIM_USERNAME,
		})
		.run();
	const tokens = startSignIn({ id: VICTIM_ID, role: 'OPERATOR' });

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
	const collisionTokens = startSignIn({ id: VICTIM_ID, role: 'OPERATOR' });
	const collisionRow = findRefreshSession(collisionTokens.refreshToken);
	assert(collisionRow !== undefined, 'a new sign-in must store its refresh token');
	if (!collisionRow) throw new Error('collision sign-in was not stored');
	const collisionSet = { headers: {} as Record<string, number | string> };
	const collisionError = handleRotationCollision(false, collisionRow, collisionSet);
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

	// --- Criterion 7: an expired lock restarts the count instead of re-locking at once ---
	const victimRow = () => db.select().from(users).where(eq(users.id, VICTIM_ID)).get();
	await login(VICTIM_USERNAME, 'wrong-password', '127.0.0.1');
	assert(
		victimRow()?.failedLoginAttempts === 99,
		'a failure during an active lock must not change the counter',
	);
	db.update(users)
		.set({ failedLoginAttempts: 99, lockedUntil: new Date(Date.now() - 60 * 1000) })
		.where(eq(users.id, VICTIM_ID))
		.run();
	const afterExpiry = await login(VICTIM_USERNAME, 'wrong-password', '127.0.0.1');
	assert(
		'reason' in afterExpiry && afterExpiry.reason === 'invalid',
		`one failure after the lock expired must be 'invalid', got ${JSON.stringify(afterExpiry)}`,
	);
	const expiredRow = victimRow();
	assert(
		expiredRow?.failedLoginAttempts === 1 && expiredRow.lockedUntil === null,
		`after an expired lock the counter must restart at 1 with no lock, got ${JSON.stringify({ attempts: expiredRow?.failedLoginAttempts, lockedUntil: expiredRow?.lockedUntil })}`,
	);
	const recovered = await login(VICTIM_USERNAME, VICTIM_PASSWORD, '127.0.0.1');
	assert(
		!('reason' in recovered),
		`the right password after one post-expiry failure must sign in, got ${JSON.stringify(recovered)}`,
	);

	await dispose();

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
