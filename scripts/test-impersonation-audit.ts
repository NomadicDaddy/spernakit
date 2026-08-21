#!/usr/bin/env bun
/**
 * Regression coverage for impersonation audit attribution and the impersonation kill-switch
 * (`.aidd/features/audit-impersonation-attribution`).
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via `app.handle()`:
 *  1. A SYSOP starts impersonating an OPERATOR; a mutation made with the impersonation token is
 *     recorded by the audit plugin with `userId` = the impersonated account AND
 *     `impersonatedBy` = the operator, and the audit query joins the operator's username.
 *  2. `actorFields()` — the helper every explicit `auditService.log()` caller uses — persists both
 *     identities the same way.
 *  3. With `security.impersonationEnabled=false`, `POST /users/:id/impersonate` answers 403 even for
 *     a SYSOP, while `POST /users/impersonate/stop` still ends an in-flight session (200) and
 *     restores the stashed operator cookie.
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
import { actorFields, log as logAudit, query } from '../backend/src/services/auditService.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSOP_ID = 1;
const TARGET_ID = 2;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** Value of `name` from a response's Set-Cookie headers, URL-decoded; null when absent. */
function setCookieValue(response: Response, name: string): null | string {
	for (const header of response.headers.getSetCookie()) {
		const match = new RegExp(`^${name}=([^;]*)`).exec(header);
		if (match) return decodeURIComponent(match[1] ?? '');
	}
	return null;
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.audit.enabled = true;
	config.audit.ipWhitelist = [];
	config.security.impersonationEnabled = true;
	const cookieName = config.security.authCookieName;
	const stashName = `${cookieName}_imp_orig`;
	const origin = config.server.frontendUrl;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-impersonation-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	const db = getDb();
	db.insert(users)
		.values([
			{
				email: 'sysop@example.com',
				id: SYSOP_ID,
				passwordHash: 'x',
				role: 'SYSOP',
				username: 'sysop',
			},
			{
				email: 'target@example.com',
				id: TARGET_ID,
				passwordHash: 'x',
				role: 'OPERATOR',
				username: 'target',
			},
		])
		.run();

	const app = createApiApp();
	const sysopToken = signAccessToken({ id: SYSOP_ID, role: 'SYSOP' });
	const sysopCsrf = await generateAndStoreCsrfToken(SYSOP_ID);
	const targetCsrf = await generateAndStoreCsrfToken(TARGET_ID);
	const post = (path: string, cookie: string, csrf: string, body?: unknown): Promise<Response> =>
		app.handle(
			new Request(`http://localhost/api/v1${path}`, {
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
				headers: {
					...(body !== undefined ? { 'content-type': 'application/json' } : {}),
					cookie,
					origin,
					'X-CSRF-Token': csrf,
				},
				method: body !== undefined ? 'PUT' : 'POST',
			}),
		);

	// --- 1. start impersonation, mutate as the impersonated session ---
	const start = await post(
		`/users/${String(TARGET_ID)}/impersonate`,
		`${cookieName}=${sysopToken}`,
		sysopCsrf,
	);
	assert(
		start.status === 200,
		`impersonate start must be 200, got ${String(start.status)} ${await start.clone().text()}`,
	);
	const impToken = setCookieValue(start, cookieName) ?? '';
	assert(impToken !== '' && impToken !== sysopToken, 'impersonation issues a new auth cookie');
	assert(
		setCookieValue(start, stashName) === sysopToken,
		'operator token is stashed in the _imp_orig cookie',
	);

	const mutate = await post('/users/me', `${cookieName}=${impToken}`, targetCsrf, {
		username: 'target2',
	});
	assert(
		mutate.status === 200,
		`PUT /users/me under impersonation must be 200, got ${String(mutate.status)} ${await mutate.clone().text()}`,
	);
	// onAfterResponse runs after app.handle() resolves; let the hook settle before reading.
	await new Promise((resolve) => setTimeout(resolve, 50));
	const pluginRow = db
		.select()
		.from(auditLogs)
		.all()
		.find((row) => row.action === 'PUT /api/v1/users/me');
	assert(
		pluginRow !== undefined,
		`audit plugin recorded the impersonated mutation (rows: ${db
			.select({ action: auditLogs.action })
			.from(auditLogs)
			.all()
			.map((r) => r.action)
			.join(', ')})`,
	);
	assert(
		pluginRow?.userId === TARGET_ID,
		`plugin row userId is the impersonated account, got ${String(pluginRow?.userId)}`,
	);
	assert(
		pluginRow?.impersonatedBy === SYSOP_ID,
		`plugin row impersonatedBy is the operator, got ${String(pluginRow?.impersonatedBy)}`,
	);
	const viewerRow = query({ limit: 50, page: 1 }).data.find(
		(e) => e.action === 'PUT /api/v1/users/me',
	);
	assert(
		viewerRow?.impersonatorUsername === 'sysop' && viewerRow.username === 'target2',
		'audit query joins both usernames',
	);

	// --- 2. explicit-log path via actorFields() ---
	logAudit({
		action: 'TEST_EXPLICIT',
		...actorFields({ id: TARGET_ID, impersonatedBy: SYSOP_ID }),
	});
	const explicitRow = db
		.select()
		.from(auditLogs)
		.all()
		.find((row) => row.action === 'TEST_EXPLICIT');
	assert(
		explicitRow?.userId === TARGET_ID && explicitRow.impersonatedBy === SYSOP_ID,
		'actorFields persists both identities',
	);
	logAudit({ action: 'TEST_PLAIN', ...actorFields({ id: SYSOP_ID }) });
	const plainRow = db
		.select()
		.from(auditLogs)
		.all()
		.find((row) => row.action === 'TEST_PLAIN');
	assert(
		plainRow?.impersonatedBy === null,
		'actorFields leaves impersonatedBy NULL for a normal session',
	);

	// --- 3. kill-switch: start is 403, stop still works ---
	config.security.impersonationEnabled = false;
	const blocked = await post(
		`/users/${String(TARGET_ID)}/impersonate`,
		`${cookieName}=${sysopToken}`,
		sysopCsrf,
	);
	assert(
		blocked.status === 403,
		`impersonate start must be 403 when disabled, got ${String(blocked.status)}`,
	);
	assert(
		(await blocked.text()).includes('impersonationEnabled'),
		'the 403 names the config flag',
	);
	const stop = await post(
		'/users/impersonate/stop',
		`${cookieName}=${impToken}; ${stashName}=${sysopToken}`,
		targetCsrf,
	);
	assert(
		stop.status === 200,
		`impersonate stop must stay available when disabled, got ${String(stop.status)} ${await stop.clone().text()}`,
	);
	assert(
		setCookieValue(stop, cookieName) === sysopToken,
		'stop restores the stashed operator cookie',
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log(
			'[OK] impersonation-audit: attribution persists both identities; kill-switch blocks start, not stop',
		);
		process.exit(0);
	}
	console.error('[FAIL] impersonation-audit:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-impersonation-audit:', err);
	process.exit(1);
});
