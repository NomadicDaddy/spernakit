#!/usr/bin/env bun
/**
 * Regression coverage for the set of routes an anonymous caller can reach
 * (`.aidd/features/remediation-20260827-validation-runs-before-the-auth-guard`).
 *
 * `scripts/test-auth-before-validation.ts` proves that a guard, where one exists, runs ahead of
 * validation. It cannot prove that a route has one. Authorization travels as a route option, so a
 * route ships open by leaving `requireAuth` off, and the omission is invisible: nothing is written
 * that looks wrong, and `backend/src/routes/auth/mfa.ts`, `auth/utils.ts`, and
 * `dashboards/templates-import.ts` each hold guarded and unguarded handlers in one file, so reading
 * a file cannot answer it either. A text scan over the route sources would have to decide which of
 * several handlers a flag belongs to, and would be wrong in exactly those three files.
 *
 * So this gate asks the application instead. It boots the real API, enumerates the routes Elysia
 * registered, and sends each one an anonymous request. Anything that answers is either on the
 * allowlist in `scripts/lib/public-routes.ts` with a reason, or it is a route that shipped without
 * a guard.
 *
 * The list is checked in both directions. An entry that names no registered route is stale, and an
 * entry whose route now refuses anonymous callers is permission nobody is using: both fail here
 * rather than sitting in the file as an exemption whose reason has quietly stopped applying.
 *
 * Runs in process against a throwaway temp-file SQLite database. The probe sends real requests, so
 * a route that is open and destructive acts on that database and nothing else.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import { PUBLIC_ROUTES, publicRouteIndex, routeKey } from './lib/public-routes.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
/**
 * The floor the enumeration has to clear.
 *
 * An application that failed to mount its route modules registers a handful of routes and passes
 * every assertion below, because there is nothing left to be open. The floor is well under the 146
 * routes registered when this was written, so it fails a collapse without failing a release that
 * merely removed a few endpoints.
 */
const MINIMUM_ROUTES = 100;
/** A route that must be refused, so a run where everything is refused for the wrong reason fails. */
const REPRESENTATIVE_GUARDED = { method: 'POST', path: '/api/v1/workspaces/' };

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** What Elysia exposes about the routes it registered. */
interface RegisteredRoute {
	method: string;
	path: string;
}

/** One route, and the status it answered an anonymous caller with. */
interface Probe {
	key: string;
	method: string;
	path: string;
	status: number;
}

/**
 * Send one anonymous request to a registered route.
 *
 * Path parameters are filled with `1`, which is a plausible id and a token that matches nothing.
 * The request carries no cookie and no API key, so whatever answers is what the route gives to
 * someone with no account at all. `OPTIONS` and `HEAD` are skipped by the caller: Elysia answers
 * both itself, ahead of any route option, so their status says nothing about the route's guard.
 *
 * @param app - The booted application.
 * @param route - The route as Elysia registered it.
 * @returns The route with the status it answered.
 */
async function probe(app: ReturnType<typeof createApiApp>, route: RegisteredRoute): Promise<Probe> {
	const method = route.method.toUpperCase();
	const path = route.path.replaceAll(/:[A-Za-z0-9_]+/g, '1');
	const headers: Record<string, string> = { origin: getConfig().server.frontendUrl };
	const init: RequestInit = { headers, method };
	if (method !== 'GET') {
		headers['content-type'] = 'application/json';
		init.body = '{}';
	}

	let status: number;
	try {
		status = (await app.handle(new Request(`http://localhost${path}`, init))).status;
	} catch (err) {
		// A route that throws on an anonymous request has not refused it, so it is reported rather
		// than skipped; the message is carried through so the failure names the actual cause.
		status = 0;
		failures.push(
			`${routeKey(method, route.path)} threw for an anonymous caller: ${String(err)}`,
		);
	}
	return { key: routeKey(method, route.path), method, path: route.path, status };
}

/** Whether this status is the route refusing an anonymous caller. */
function refused(status: number): boolean {
	return status === 401 || status === 403;
}

/**
 * The enumeration reached the real route table.
 *
 * Both halves matter. A boot that registered almost nothing would find nothing open, and a run
 * where every request failed for some unrelated reason would find everything refused; each would
 * report a pass while proving nothing.
 */
function theSurfaceIsReal(probes: Probe[]): void {
	assert(
		probes.length >= MINIMUM_ROUTES,
		`the application registered ${String(probes.length)} routes, fewer than the ${String(MINIMUM_ROUTES)} this gate expects to probe`,
	);
	const control = routeKey(REPRESENTATIVE_GUARDED.method, REPRESENTATIVE_GUARDED.path);
	const guarded = probes.find((item) => item.key === control);
	assert(
		guarded !== undefined && refused(guarded.status),
		`${control} must refuse an anonymous caller, and is the control that this probe rejects anything at all`,
	);
}

/**
 * Every route not on the allowlist refuses an anonymous caller.
 *
 * This is the property the gate exists for. A route added without `requireAuth` answers here, and
 * the failure names it and the status it gave away.
 */
function nothingUnlistedIsOpen(probes: Probe[]): void {
	const allowed = publicRouteIndex();
	for (const item of probes) {
		if (refused(item.status) || allowed.has(item.key)) continue;
		failures.push(
			`${item.key} answered an anonymous caller with ${String(item.status)}; give it requireAuth (or the role it needs), or list it in scripts/lib/public-routes.ts with the reason it is public`,
		);
	}
}

/**
 * Every allowlist entry still names a route the application registers.
 *
 * A renamed or removed route leaves its exemption behind, and the exemption then covers whatever
 * later takes that path.
 */
function theListHasNoStaleEntries(probes: Probe[]): void {
	const registered = new Set(probes.map((item) => item.key));
	for (const route of PUBLIC_ROUTES) {
		const key = routeKey(route.method, route.path);
		assert(
			registered.has(key),
			`scripts/lib/public-routes.ts lists ${key}, which the application does not register; remove the entry`,
		);
	}
}

/**
 * Every allowlist entry names a route that is genuinely open.
 *
 * An entry for a route that now refuses anonymous callers is permission nobody is exercising. It
 * reads as a decision that was made and is still in force, and it would silently re-open the route
 * the day the guard came off.
 */
function theListHasNoUnusedEntries(probes: Probe[]): void {
	const byKey = new Map(probes.map((item) => [item.key, item]));
	for (const route of PUBLIC_ROUTES) {
		const key = routeKey(route.method, route.path);
		const item = byKey.get(key);
		if (!item) continue;
		assert(
			!refused(item.status),
			`scripts/lib/public-routes.ts lists ${key} as public, but it answered ${String(item.status)}; it is guarded now, so remove the entry`,
		);
	}
}

/** Every allowlist entry says why, in something longer than a word. */
function everyEntryGivesAReason(): void {
	for (const route of PUBLIC_ROUTES) {
		assert(
			route.reason.trim().length >= 20,
			`scripts/lib/public-routes.ts lists ${routeKey(route.method, route.path)} without a reason worth reading`,
		);
	}
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	// The limiter counts every request including the refused ones, and this gate sends one per
	// route: left on, the tail of the probe would be answered 429 and read as neither open nor
	// refused.
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-route-surface-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, which its guard enforces from
	// beforeHandle: left set, an authenticated probe would be refused for an unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const app = createApiApp();
	const registered = (app as unknown as { routes: RegisteredRoute[] }).routes.filter((route) => {
		const method = route.method.toUpperCase();
		return method !== 'OPTIONS' && method !== 'HEAD';
	});

	const probes: Probe[] = [];
	for (const route of registered) probes.push(await probe(app, route));

	theSurfaceIsReal(probes);
	nothingUnlistedIsOpen(probes);
	theListHasNoStaleEntries(probes);
	theListHasNoUnusedEntries(probes);
	everyEntryGivesAReason();

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log(
			`[OK] public-route-surface: ${String(probes.length)} routes probed, ${String(PUBLIC_ROUTES.length)} public on purpose`,
		);
		process.exit(0);
	}
	console.error('[FAIL] public-route-surface:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-public-route-surface:', err);
	process.exit(1);
});
