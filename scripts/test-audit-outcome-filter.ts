#!/usr/bin/env bun
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
import { workspaces } from '../backend/src/db/schema/workspaces.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROUNDS = 4;
const WRONG_PASSWORD = 'not-the-password-9!';
const LOGIN_PATH = '/api/v1/auth/login';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

type App = ReturnType<typeof createApiApp>;

interface AuditRow {
	action: string;
	id: number;
	status: null | number;
	submittedUsername: null | string;
	username: null | string;
}

function sysopSeed(): { password: string; username: string } {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === 'SYSOP');
	if (!seed) throw new Error('SEED_USERS carries no SYSOP account');
	return { password: seed.password, username: seed.username };
}

function sysopId(): number {
	const { username } = sysopSeed();
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === username);
	if (!row) throw new Error(`the seed produced no ${username} account`);
	return row.id;
}

function attemptLogin(app: App, password: string): Promise<Response> {
	const config = getConfig();
	return app.handle(
		new Request(`http://localhost${LOGIN_PATH}`, {
			body: JSON.stringify({ password, username: sysopSeed().username }),
			headers: {
				'content-type': 'application/json',
				origin: config.server.frontendUrl,
			},
			method: 'POST',
		}),
	);
}

function request(app: App, query: string, workspaceId?: number): Promise<Response> {
	const config = getConfig();
	const token = signAccessToken({ id: sysopId(), role: 'SYSOP' });
	return app.handle(
		new Request(`http://localhost/api/v1/audit-logs?${query}`, {
			headers: {
				cookie: `${config.security.authCookieName}=${token}`,
				origin: config.server.frontendUrl,
				...(workspaceId === undefined ? {} : { 'x-workspace-id': String(workspaceId) }),
			},
			method: 'GET',
		}),
	);
}

async function list(
	app: App,
	query: string,
	workspaceId?: number,
): Promise<{ data: AuditRow[]; total: number }> {
	const response = await request(app, query, workspaceId);
	const payload = (await response.json()) as {
		data?: AuditRow[];
		total?: number;
	};
	if (response.status !== 200) {
		throw new Error(`listing ?${query}: ${String(response.status)} ${JSON.stringify(payload)}`);
	}
	return { data: payload.data ?? [], total: payload.total ?? 0 };
}

/**
 * Wait for the two login rows to land.
 *
 * `auditPlugin` writes from `onAfterResponse`, which is not guaranteed to have run by the time
 * `app.handle` resolves, so the count is polled rather than assumed.
 */
async function awaitAuditRows(expected: number): Promise<number> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const written = getDb().select().from(auditLogs).all().length;
		if (written >= expected) return written;
		await Bun.sleep(20);
	}
	return getDb().select().from(auditLogs).all().length;
}

async function provokeLogins(app: App): Promise<void> {
	const rejected = await attemptLogin(app, WRONG_PASSWORD);
	assert(
		rejected.status === 401,
		`a wrong password must be rejected, got ${String(rejected.status)}`,
	);

	const accepted = await attemptLogin(app, sysopSeed().password);
	assert(
		accepted.status === 200,
		`the seeded password must be accepted, got ${String(accepted.status)}`,
	);

	const written = await awaitAuditRows(2);
	assert(
		written === 2,
		`both sign-ins must be recorded, and nothing else; the log holds ${String(written)} rows`,
	);
}

async function outcomeFilter(app: App): Promise<void> {
	const all = await list(app, 'limit=50');
	assert(
		all.total === 2,
		`the unfiltered listing must still return both rows, got ${String(all.total)}`,
	);

	const failed = await list(app, 'limit=50&outcome=failed');
	assert(
		failed.total === 1,
		`outcome=failed must return the rejected sign-in alone, got ${String(failed.total)}`,
	);
	const failedRow = failed.data[0];
	assert(
		failedRow?.action.endsWith(LOGIN_PATH) === true,
		`the failed row must be the sign-in attempt, got ${JSON.stringify(failedRow?.action)}`,
	);
	assert(
		failedRow?.status === 401,
		`the outcome must be readable on the row without opening it, got ${JSON.stringify(failedRow?.status)}`,
	);

	const succeeded = await list(app, 'limit=50&outcome=succeeded');
	assert(
		succeeded.total === 1,
		`outcome=succeeded must return the accepted sign-in alone, got ${String(succeeded.total)}`,
	);
	assert(
		succeeded.data[0]?.status === null,
		'a request that succeeded carries no status, which is what makes it the other half of the filter',
	);
	assert(succeeded.data[0]?.id !== failedRow?.id, 'the two halves must not return the same row');
}

async function attemptedIdentity(app: App): Promise<void> {
	const failed = await list(app, 'limit=50&outcome=failed');
	const row = failed.data[0];
	assert(
		row?.username === null,
		'the rejected attempt never authenticated, so no account may be attributed to it',
	);
	assert(
		row?.submittedUsername === sysopSeed().username,
		`the row must name the account the request tried to use, or it reads as System activity; got ${JSON.stringify(row?.submittedUsername)}`,
	);
}

/** The new filter narrows the existing ones rather than replacing them. */
async function composesWithExistingFilters(app: App): Promise<void> {
	const withAction = await list(app, 'limit=50&outcome=failed&action=POST%20');
	assert(
		withAction.total === 1,
		`outcome must compose with the action filter, got ${String(withAction.total)}`,
	);

	const withSearch = await list(app, 'limit=50&outcome=succeeded&search=login');
	assert(
		withSearch.total === 1,
		`outcome must compose with free-text search, got ${String(withSearch.total)}`,
	);

	const contradictory = await list(app, 'limit=50&outcome=failed&search=no-such-thing');
	assert(
		contradictory.total === 0,
		'a filter that composes must be able to return nothing, or it is being ignored',
	);

	const paged = await list(app, 'limit=1&page=1&sortBy=createdAt&sortDir=asc');
	assert(
		paged.data.length === 1 && paged.total === 2,
		`pagination and sorting must be unaffected, got ${String(paged.data.length)} of ${String(paged.total)}`,
	);

	const selected = await list(app, 'limit=50&outcome=failed&fields=id,status,submittedUsername');
	assert(
		JSON.stringify(Object.keys(selected.data[0] ?? {}).sort()) ===
			JSON.stringify(['id', 'status', 'submittedUsername']),
		`field selection must reach the new fields, got ${JSON.stringify(Object.keys(selected.data[0] ?? {}))}`,
	);
}

async function rejectsUnknownOutcome(app: App): Promise<void> {
	const response = await request(app, 'outcome=maybe');
	assert(
		response.status >= 400,
		`an unrecognised outcome must be refused rather than ignored, got ${String(response.status)}`,
	);
}

/** Workspace scope and date validation still reach the extracted normalizer. */
async function workspaceAndDateRegressions(app: App): Promise<void> {
	getDb()
		.insert(workspaces)
		.values([
			{ id: 41, name: 'Audit Scope 41', ownerId: sysopId(), slug: 'audit-scope-41' },
			{ id: 42, name: 'Audit Scope 42', ownerId: sysopId(), slug: 'audit-scope-42' },
		])
		.run();
	getDb()
		.insert(auditLogs)
		.values([
			{ action: 'workspace.scope.probe', workspaceId: 41 },
			{ action: 'workspace.scope.probe', workspaceId: 42 },
		])
		.run();
	const scoped = await list(app, 'action=workspace.scope.probe', 41);
	assert(scoped.total === 1, `workspace scope must survive normalization, got ${scoped.total}`);

	const invalid = await request(app, 'dateFrom=not-a-date');
	assert(invalid.status === 400, `invalid dates must still be rejected, got ${invalid.status}`);
	const reversed = await request(
		app,
		'dateFrom=2026-02-02T00%3A00%3A00Z&dateTo=2026-02-01T00%3A00%3A00Z',
	);
	assert(
		reversed.status === 400,
		`reversed ranges must still be rejected, got ${reversed.status}`,
	);
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;
	config.audit.enabled = true;
	// 127.0.0.1 and ::1 ship whitelisted, and this gate's own traffic is local: left in place the
	// plugin would drop every row and each assertion below would fail for the wrong reason.
	config.audit.ipWhitelist = [];

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-audit-outcome-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);

	const app = createApiApp();
	await provokeLogins(app);
	await outcomeFilter(app);
	await attemptedIdentity(app);
	await composesWithExistingFilters(app);
	await rejectsUnknownOutcome(app);
	await workspaceAndDateRegressions(app);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log(
			'[OK] audit-outcome-filter: a failed sign-in is filterable, readable, and named on the row',
		);
		process.exit(0);
	}
	console.error('[FAIL] audit-outcome-filter:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-audit-outcome-filter:', err);
	process.exit(1);
});
