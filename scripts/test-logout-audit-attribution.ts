#!/usr/bin/env bun
/**
 * Regression coverage for sign-out audit attribution
 * (`.aidd/features/remediation-20260926-logout-audit-attributed-to-system`).
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via `app.handle()`:
 *  1. A signed-in user's `POST /auth/logout` is recorded by the audit plugin with that user as the
 *     actor. Logout revokes the access token before `onAfterResponse` runs, and the plugin's cookie
 *     path rejects a revoked token, so the handler must publish the identity it resolved.
 *  2. Replaying the now-revoked token credits nobody: the actor is resolved with the same
 *     revocation-aware check the plugin uses, not from the signature alone.
 *  3. A logout with no session still succeeds, and its audit row carries no invented actor.
 *  4. Signing out of an impersonated session keeps both identities on the row.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { auditLogs } from '../backend/src/db/schema/auditLogs.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OPERATOR_ID = 1;
const USER_ID = 7;
/** A separate account for case 4: logout sets a per-user revocation watermark on USER_ID, and a
 * token issued inside the same second (JWT iat granularity) would read as revoked. */
const IMPERSONATED_ID = 8;
const LOGOUT_ACTION = 'POST /api/v1/auth/logout';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.audit.enabled = true;
	config.audit.ipWhitelist = [];
	const cookieName = config.security.authCookieName;
	const origin = config.server.frontendUrl;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-logout-audit-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	const db = getDb();
	db.insert(users)
		.values([
			{
				email: 'sysop@example.com',
				id: OPERATOR_ID,
				passwordHash: 'x',
				role: 'SYSOP',
				username: 'sysop',
			},
			{
				email: 'operator@example.com',
				id: USER_ID,
				passwordHash: 'x',
				role: 'OPERATOR',
				username: 'operator',
			},
			{
				email: 'impersonated@example.com',
				id: IMPERSONATED_ID,
				passwordHash: 'x',
				role: 'OPERATOR',
				username: 'impersonated',
			},
		])
		.run();

	const app = createApiApp();
	const logout = (headers: Record<string, string>): Promise<Response> =>
		app.handle(
			new Request('http://localhost/api/v1/auth/logout', {
				headers: { origin, ...headers },
				method: 'POST',
			}),
		);

	let seen = 0;
	/** The audit row the most recent logout added; undefined when it added none. */
	const nextLogoutRow = async (): Promise<typeof auditLogs.$inferSelect | undefined> => {
		// onAfterResponse runs after app.handle() resolves; let the hook settle before reading.
		await new Promise((done) => setTimeout(done, 50));
		const rows = db
			.select()
			.from(auditLogs)
			.all()
			.filter((row) => row.action === LOGOUT_ACTION);
		const added = rows.slice(seen);
		seen = rows.length;
		assert(added.length <= 1, `one logout row per request, got ${String(added.length)}`);
		return added[0];
	};

	// --- 1. signed-in logout is attributed to the user who signed out ---
	const token = signAccessToken({ id: USER_ID, role: 'OPERATOR' });
	const csrf = (await generateAndStoreCsrfToken(USER_ID)) ?? '';
	const cookie = `${cookieName}=${token}`;
	const signedIn = await logout({ cookie, 'X-CSRF-Token': csrf });
	assert(
		signedIn.status === 200,
		`signed-in logout must be 200, got ${String(signedIn.status)} ${await signedIn.clone().text()}`,
	);
	const attributed = await nextLogoutRow();
	assert(
		attributed?.userId === USER_ID,
		`logout row names the signed-out user, got ${String(attributed?.userId)}`,
	);

	// --- 2. replaying the revoked token credits nobody ---
	await logout({ cookie, 'X-CSRF-Token': csrf });
	const replayed = await nextLogoutRow();
	if (replayed !== undefined) {
		assert(
			replayed.userId === null,
			`a replayed, revoked token must credit nobody, got ${String(replayed.userId)}`,
		);
	}

	// --- 3. anonymous logout still succeeds and invents no actor ---
	const anonymous = await logout({});
	assert(
		anonymous.status === 200,
		`anonymous logout must stay 200, got ${String(anonymous.status)}`,
	);
	const anonymousRow = await nextLogoutRow();
	if (anonymousRow !== undefined) {
		assert(
			anonymousRow.userId === null,
			`anonymous logout row must carry no actor, got ${String(anonymousRow.userId)}`,
		);
	}

	// --- 4. an impersonated sign-out keeps both identities ---
	const impToken = signAccessToken({
		id: IMPERSONATED_ID,
		impersonatedBy: OPERATOR_ID,
		role: 'OPERATOR',
	});
	const impCsrf = (await generateAndStoreCsrfToken(IMPERSONATED_ID)) ?? '';
	await logout({ cookie: `${cookieName}=${impToken}`, 'X-CSRF-Token': impCsrf });
	const impersonated = await nextLogoutRow();
	assert(
		impersonated?.userId === IMPERSONATED_ID && impersonated.impersonatedBy === OPERATOR_ID,
		`impersonated logout keeps both identities, got user ${String(impersonated?.userId)} by ${String(impersonated?.impersonatedBy)}`,
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('[OK] logout-audit-attribution: sign-out rows name the user who signed out');
		process.exit(0);
	}
	console.error('[FAIL] logout-audit-attribution:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-logout-audit-attribution:', err);
	process.exit(1);
});
