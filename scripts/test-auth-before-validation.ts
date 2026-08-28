#!/usr/bin/env bun
/**
 * Regression coverage for authorization running ahead of body validation
 * (`.aidd/features/remediation-20260827-validation-runs-before-the-auth-guard`).
 *
 * The defect this gate was written for: the `requireAuth` and `requireRoleFresh` guards ran from
 * `beforeHandle`, which Elysia reaches only after it has checked the request body against the
 * route's schema. An anonymous caller who posted a malformed body to a protected route was
 * therefore answered with a 400 describing the schema of a route they were never allowed to see,
 * and the body of every rejected request was parsed and validated before anyone asked who sent it.
 *
 * The property under test is the ordering itself. Both guards now run at the transform stage,
 * carried by a macro on the auth plugin every route file already uses, so a route added later gets
 * the ordering by writing `requireAuth: true` or `requireRole: 'ADMIN'` rather than by remembering
 * a lifecycle rule. The gate asserts that ordering against the real application, that the rejection
 * says nothing about the schema, that deliberately public routes still validate, and that no route
 * file has quietly gone back to guarding from `beforeHandle`.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UserRole } from '../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { createWorkspaceDocs } from '../backend/src/routes/workspaces/crud.docs.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import { declaredStatuses, findBeforeHandleGuards } from './lib/auth-ordering.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
/** The representative protected route: ADMIN or higher, with a body schema to be skipped. */
const CREATE_WORKSPACE = '/api/v1/workspaces';
/** A body the route's schema rejects: `name` and `slug` are both required strings. */
const INVALID_BODY = { description: 'neither name nor slug' };
const VALID_BODY = { name: 'Ordering Probe', slug: 'ordering-probe' };

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

type App = ReturnType<typeof createApiApp>;
type Claim = { id: number; role: UserRole };

/** The id of a seeded account, looked up by the role the seed gave it. */
function seedUserId(role: UserRole): number {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === role);
	if (!seed) throw new Error(`SEED_USERS carries no ${role} account`);
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === seed.username);
	if (!row) throw new Error(`the seed produced no ${seed.username} account`);
	return row.id;
}

/**
 * One request to the representative route.
 *
 * `claim` is what the caller's token says about them, which is deliberately not always the truth:
 * the freshness check below signs a stale role to prove the guard reads the database rather than
 * the token.
 */
function post(app: App, path: string, body: unknown, claim?: Claim): Promise<Response> {
	const config = getConfig();
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		origin: config.server.frontendUrl,
	};
	if (claim) {
		headers.cookie = `${config.security.authCookieName}=${signAccessToken(claim)}`;
	}
	return app.handle(
		new Request(`http://localhost${path}`, {
			body: JSON.stringify(body),
			headers,
			method: 'POST',
		}),
	);
}

/**
 * The ordering, stated as the sequence the spec asks for.
 *
 * Anonymous is answered 401 whether the body is valid or not, an under-privileged caller 403 the
 * same way, and only a caller the route would actually admit ever hears about the schema. If any
 * of the first four came back 400, validation had run for someone the route rejects.
 */
async function orderingSequence(app: App): Promise<Response> {
	const viewer: Claim = { id: seedUserId('VIEWER'), role: 'VIEWER' };
	const admin: Claim = { id: seedUserId('ADMIN'), role: 'ADMIN' };
	const cases: { body: unknown; claim?: Claim; expected: number; label: string }[] = [
		{ body: INVALID_BODY, expected: 401, label: 'anonymous with an invalid body' },
		{ body: VALID_BODY, expected: 401, label: 'anonymous with a valid body' },
		{ body: INVALID_BODY, claim: viewer, expected: 403, label: 'VIEWER with an invalid body' },
		{ body: VALID_BODY, claim: viewer, expected: 403, label: 'VIEWER with a valid body' },
		{ body: INVALID_BODY, claim: admin, expected: 400, label: 'ADMIN with an invalid body' },
	];

	let anonymousInvalid: Response | undefined;
	for (const item of cases) {
		const response = await post(app, CREATE_WORKSPACE, item.body, item.claim);
		assert(
			response.status === item.expected,
			`${item.label} must be answered ${String(item.expected)}, got ${String(response.status)}`,
		);
		anonymousInvalid ??= response;
	}
	if (!anonymousInvalid) throw new Error('the ordering sequence ran no requests');
	return anonymousInvalid;
}

/**
 * The rejection an anonymous caller receives says nothing about the route's schema.
 *
 * A 401 that still listed the field names, their constraints, or an example body would have leaked
 * the shape of a route the caller was refused, which is most of what moving the check earlier was
 * meant to stop.
 */
async function carriesNoSchemaDetail(response: Response): Promise<void> {
	const body = await response.text();
	for (const leak of ['slug', 'minLength', 'maxLength', 'Expected', 'pattern']) {
		assert(
			!body.includes(leak),
			`the 401 must not describe the schema, but its body carries "${leak}": ${body}`,
		);
	}
}

/**
 * The ordering is structural, not a habit each route file keeps up.
 *
 * Every authorization decision now travels as a route option that the auth plugin's macro runs at
 * the transform stage. A route that guards from `beforeHandle` again would validate first and
 * would not fail any of the assertions above, because those only exercise one route.
 */
function orderingIsStructural(): void {
	const offenders = findBeforeHandleGuards(repoRoot);
	assert(
		offenders.length === 0,
		`authorization must not run from beforeHandle, where validation precedes it: ${offenders.join(', ')}`,
	);
}

/**
 * A route that is public on purpose still validates its body and still answers 400.
 *
 * Sign-in has no caller to reject, so nothing runs ahead of validation there and a malformed
 * request is a genuine 400. Moving the guards earlier must not have made every bad body a 401.
 */
async function publicRoutesStillValidate(app: App): Promise<void> {
	const response = await post(app, '/api/v1/auth/login', { username: 'sysop' });
	assert(
		response.status === 400,
		`a public route must still reject a malformed body with 400, got ${String(response.status)}`,
	);
}

/** The runtime answers with statuses the published document already promises for this route. */
function documentAgreesWithRuntime(): void {
	const declared = declaredStatuses(createWorkspaceDocs);
	for (const status of ['401', '403']) {
		assert(
			declared.includes(status),
			`the document for ${CREATE_WORKSPACE} must declare ${status}, it declares ${declared.join(', ')}`,
		);
	}
}

/**
 * The role the guard read back from the database still reaches the handler.
 *
 * `requireRoleFresh` re-reads the caller's role and writes it onto the request context, so a token
 * carrying a stale role is corrected before the handler runs. That correction used to happen in
 * `beforeHandle`; it now happens a stage earlier, and the handler has to see it just the same.
 *
 * The probe is a settings key under a restricted prefix, which the handler refuses for anyone below
 * SYSOP. A token that claims VIEWER for the seeded SYSOP account gets past the ADMIN guard only
 * because the guard read the database, and reaches the 404 for a key that does not exist only
 * because the handler saw SYSOP rather than the VIEWER the token claimed. A genuine ADMIN is the
 * control: it must still be refused.
 */
async function freshRoleReachesHandler(app: App): Promise<void> {
	const config = getConfig();
	const probe = '/api/v1/settings/security.ordering_probe';
	const get = (claim: Claim): Promise<Response> =>
		app.handle(
			new Request(`http://localhost${probe}`, {
				headers: {
					cookie: `${config.security.authCookieName}=${signAccessToken(claim)}`,
					origin: config.server.frontendUrl,
				},
			}),
		);

	const stale = await get({ id: seedUserId('SYSOP'), role: 'VIEWER' });
	assert(
		stale.status === 404,
		`a stale VIEWER claim on the SYSOP account must reach the handler as SYSOP, got ${String(stale.status)}`,
	);

	const admin = await get({ id: seedUserId('ADMIN'), role: 'ADMIN' });
	assert(
		admin.status === 403,
		`a genuine ADMIN must still be refused a restricted setting, got ${String(admin.status)}`,
	);
}

/**
 * A request the guards reject is still counted by the rate limiter.
 *
 * The limiter moved to the transform stage alongside the guards. Had it stayed in `beforeHandle`,
 * an anonymous flood of a protected route would have been answered 401 by the guard and never
 * counted at all, which is the hole this half of the change closes.
 */
async function limiterCountsRejectedRequests(app: App): Promise<void> {
	const config = getConfig();
	config.rateLimit.backend = 'memory';
	config.rateLimit.maxRequests = 2;
	config.rateLimit.windowMs = 60_000;
	config.rateLimit.enabled = true;
	try {
		const first = await post(app, CREATE_WORKSPACE, VALID_BODY);
		const second = await post(app, CREATE_WORKSPACE, VALID_BODY);
		const third = await post(app, CREATE_WORKSPACE, VALID_BODY);
		assert(
			first.status === 401 && second.status === 401,
			`requests within the limit must still be answered 401, got ${String(first.status)} and ${String(second.status)}`,
		);
		assert(
			third.status === 429,
			`requests the guard rejects must still count toward the limit, got ${String(third.status)}`,
		);
		assert(
			third.headers.get('Retry-After') !== null,
			'a limited request must carry Retry-After, which only survives if the rejection kept its headers',
		);
	} finally {
		config.rateLimit.enabled = false;
	}
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-auth-ordering-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, which its guard enforces from
	// beforeHandle: left set, every assertion past the transform stage would be a 403 for an
	// unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const app = createApiApp();
	const anonymousInvalid = await orderingSequence(app);
	await carriesNoSchemaDetail(anonymousInvalid);
	orderingIsStructural();
	await publicRoutesStillValidate(app);
	documentAgreesWithRuntime();
	await freshRoleReachesHandler(app);
	await limiterCountsRejectedRequests(app);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('[OK] auth-before-validation: a rejected caller never reaches the schema');
		process.exit(0);
	}
	console.error('[FAIL] auth-before-validation:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-auth-before-validation:', err);
	process.exit(1);
});
