#!/usr/bin/env bun
/**
 * Regression test for several simultaneous sign-ins by one user
 * (`.aidd/features/audit-logic-1790885877-a-second-login-or-a-concurrent-refresh-from-another-tab-is-treated-as-refresh-to`).
 *
 * A user used to hold one refresh-token slot, overwritten by every login, and any token that was
 * not the stored one counted as theft. Signing in on a second browser therefore signed the first
 * one out, and its next refresh revoked every session the user had. Each sign-in is now a family
 * of its own. Runs fully in-process against a throwaway temp-file SQLite DB via `app.handle()`:
 *  1. Two sign-ins by the same user can both refresh, the earlier one included.
 *  2. Replaying a rotated token ends that sign-in only: the other sign-in still refreshes, and the
 *     ended sign-in's current token is answered AUTH_TOKEN_INVALID rather than revoking again.
 *  3. Logging out of one sign-in leaves the other working at once, in the same second: its access
 *     token is still accepted (a logout revokes its own token, not the account), it can refresh,
 *     and its CSRF token still validates because logout no longer wipes the shared CSRF secret.
 *  4. A password change ends every sign-in the user has.
 *  5. Token cleanup deletes only expired rows. It used to clear the refresh credential of anyone
 *     whose last password sign-in was 30 days old, cutting off sessions kept alive by refresh
 *     (`.aidd/features/audit-logic-1790885878-token-cleanup-clears-the-refresh-hash-30-days-after-the-last-login-cutting-off-a`).
 */
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { changeUserPassword, hashPassword } from '../backend/src/services/auth/authCore.ts';
import { tokenCleanupTask } from '../backend/src/services/scheduler/cleanupAuth.ts';
import { findRefreshSession } from '../backend/src/utils/auth/refreshSessions.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'C0rrectHorse!9';
const NEW_PASSWORD = 'Batt3ryStaple!7';
/**
 * One account per case. A theft response leaves an account-wide revocation with one-second
 * resolution, so a later case on the same account would see its fresh tokens revoked for reasons
 * that belong to an earlier case.
 */
const ACCOUNTS = ['two-browsers', 'replay', 'logout', 'password', 'cleanup'] as const;

type Session = { access: string; csrf: string; refresh: string };

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function setCookieValue(response: Response, name: string): string {
	for (const header of response.headers.getSetCookie()) {
		const match = new RegExp(`^${name}=([^;]*)`).exec(header);
		if (match) return decodeURIComponent(match[1] ?? '');
	}
	return '';
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	// The login limiter is keyed separately and is on by default, so a fresh checkout's config
	// answered this test's logins with 429. Process-local: no config file is written.
	config.rateLimit.authEnabled = false;
	const origin = config.server.frontendUrl;
	const accessName = config.security.authCookieName;
	const refreshName = config.security.refreshCookieName;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-refresh-sessions-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	const passwordHash = await hashPassword(PASSWORD);
	getDb()
		.insert(users)
		.values(
			ACCOUNTS.map((username, index) => ({
				email: `${username}@example.com`,
				id: index + 1,
				passwordHash,
				role: 'OPERATOR' as const,
				username,
			})),
		)
		.run();

	const app = createApiApp();
	const post = (path: string, headers: Record<string, string>, body?: unknown) =>
		app.handle(
			new Request(`http://localhost/api/v1/auth/${path}`, {
				headers: { 'content-type': 'application/json', origin, ...headers },
				method: 'POST',
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			}),
		);
	const signIn = async (username: string): Promise<Session> => {
		const res = await post('login', {}, { password: PASSWORD, username });
		assert(res.status === 200, `${username}: login must be 200, got ${String(res.status)}`);
		return {
			access: setCookieValue(res, accessName),
			csrf: res.headers.get('X-CSRF-Token') ?? '',
			refresh: setCookieValue(res, refreshName),
		};
	};
	const refresh = (session: Session) =>
		post('refresh', { cookie: `${refreshName}=${session.refresh}` });
	/** Refresh and carry the rotated tokens forward, as the browser's cookie jar would. */
	const refreshed = async (session: Session): Promise<{ next: Session; status: number }> => {
		const res = await refresh(session);
		return {
			next: {
				...session,
				access: setCookieValue(res, accessName),
				refresh: setCookieValue(res, refreshName),
			},
			status: res.status,
		};
	};

	// --- 1. a second sign-in does not displace the first ---
	const laptop = await signIn('two-browsers');
	const phone = await signIn('two-browsers');
	assert((await refresh(laptop)).status === 200, 'the earlier sign-in must still refresh');
	assert((await refresh(phone)).status === 200, 'the later sign-in must refresh too');

	// --- 2. a replay ends only the sign-in it belongs to ---
	const victim = await signIn('replay');
	const other = await signIn('replay');
	const rotated = await refreshed(victim);
	assert(rotated.status === 200, `first refresh must rotate, got ${String(rotated.status)}`);
	const replay = await refresh(victim);
	assert(
		replay.status === 401,
		`replaying a rotated token must be 401, got ${String(replay.status)}`,
	);
	assert((await replay.text()).includes('AUTH_TOKEN_REVOKED'), 'a replay must name revocation');
	const afterReplay = await refresh(rotated.next);
	assert(afterReplay.status === 401, 'the replayed sign-in must be ended');
	assert(
		(await afterReplay.text()).includes('AUTH_TOKEN_INVALID'),
		'a token from an ended sign-in is unknown, not a fresh theft',
	);
	assert((await refresh(other)).status === 200, "a replay must not end the user's other sign-in");

	// --- 3. logging out of one sign-in leaves the other working ---
	const leaving = await signIn('logout');
	const staying = await signIn('logout');
	const loggedOut = await post('logout', {
		cookie: `${accessName}=${leaving.access}`,
		'X-CSRF-Token': leaving.csrf,
	});
	assert(loggedOut.status === 200, `logout must be 200, got ${String(loggedOut.status)}`);
	assert((await refresh(leaving)).status === 401, 'the signed-out sign-in must not refresh');
	// No delay: these run in the same second as the logout, which is when a logout that revoked the
	// whole account would show.
	const me = await app.handle(
		new Request('http://localhost/api/v1/auth/me', {
			headers: { cookie: `${accessName}=${staying.access}` },
		}),
	);
	assert(
		me.status === 200,
		`the other sign-in's access token must survive, got ${String(me.status)}`,
	);
	const stayed = await refresh(staying);
	assert(
		stayed.status === 200,
		`the other sign-in must still refresh, got ${String(stayed.status)}`,
	);
	// Logout is CSRF-protected for a signed-in caller, so the original CSRF token must validate.
	const secondLogout = await post('logout', {
		cookie: `${accessName}=${staying.access}`,
		'X-CSRF-Token': staying.csrf,
	});
	assert(
		secondLogout.status === 200,
		`the other sign-in's CSRF token must survive a logout elsewhere, got ${String(secondLogout.status)}`,
	);

	// --- 4. a password change ends every sign-in ---
	const desk = await signIn('password');
	const tablet = await signIn('password');
	const changed = await changeUserPassword(
		ACCOUNTS.indexOf('password') + 1,
		PASSWORD,
		NEW_PASSWORD,
	);
	assert(changed.success, `password change must succeed: ${String(changed.error)}`);
	assert((await refresh(desk)).status === 401, 'a password change must end the first sign-in');
	assert((await refresh(tablet)).status === 401, 'a password change must end the second sign-in');

	// --- 5. token cleanup removes expired rows and leaves live sign-ins alone ---
	const cleanupId = ACCOUNTS.indexOf('cleanup') + 1;
	const live = await signIn('cleanup');
	const lapsed = await signIn('cleanup');
	const lapsedRow = findRefreshSession(lapsed.refresh);
	assert(lapsedRow !== undefined, 'a sign-in must store its refresh token');
	// Backdate through a second connection; timestamps in this schema are epoch seconds.
	const nowSeconds = Math.floor(Date.now() / 1000);
	const raw = new Database(dbPath);
	raw.run('UPDATE users SET last_login_at = ? WHERE id = ?', [
		nowSeconds - 31 * 86_400,
		cleanupId,
	]);
	raw.run('UPDATE refresh_sessions SET expires_at = ? WHERE id = ?', [
		nowSeconds - 60,
		lapsedRow?.id ?? -1,
	]);
	raw.close();
	tokenCleanupTask();
	assert(
		findRefreshSession(lapsed.refresh) === undefined,
		'token cleanup must delete an expired refresh row',
	);
	assert(
		(await refresh(live)).status === 200,
		'token cleanup must not cut off a live sign-in whose last password login is old',
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('[OK] refresh-sessions: each sign-in refreshes, and ends, on its own');
		process.exit(0);
	}
	console.error('[FAIL] refresh-sessions:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-refresh-sessions:', err);
	process.exit(1);
});
