/**
 * The world `scripts/test-bug-report-supersede.ts` sends its requests into.
 *
 * The gate itself is a list of claims the supersede link has to satisfy. Everything needed before a
 * claim can be checked lives here: a throwaway SQLite file with the migrations applied, the seeded
 * accounts the two halves of the authorization rule are checked with, and the small readers that
 * turn a response back into the value an assertion compares.
 *
 * Keeping it separate holds both files inside the 300-line modularity gate, and leaves the gate
 * readable as a list of claims rather than a setup script with the claims at the end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UserRole } from '../../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../../backend/src/config/configLoader.ts';
import { createApiApp } from '../../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../../backend/src/db/index.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../../backend/src/db/seed/users.ts';
import { signAccessToken } from '../../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../backend/src/plugins/csrf.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';

/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
const BUGS = '/api/v1/bugs';

type App = ReturnType<typeof createApiApp>;

/** One report as the API hands it back, carrying the link in both directions. */
interface ApiBugReport {
	description: string;
	id: number;
	status: string;
	supersededById: null | number;
	supersedesIds: number[];
	title: string;
}

/** What one acting session carries: the account, the role it acts as, and its CSRF token. */
interface Session {
	csrfToken: string;
	role: UserRole;
	userId: number;
}

/** A started application, the two sessions the claims act as, and the way to put both away again. */
interface Harness {
	admin: Session;
	app: App;
	dispose: () => Promise<void>;
	reporter: Session;
}

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
 * One request as one session. Every mutation here carries the session's CSRF token, because the
 * routes under test are writes and the plugin refuses a write without one.
 */
function request(
	app: App,
	method: string,
	path: string,
	session: Session,
	body?: unknown,
): Promise<Response> {
	const config = getConfig();
	const token = signAccessToken({ id: session.userId, role: session.role });
	return app.handle(
		new Request(`http://localhost${path}`, {
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			headers: {
				'content-type': 'application/json',
				cookie: `${config.security.authCookieName}=${token}`,
				origin: config.server.frontendUrl,
				'X-CSRF-Token': session.csrfToken,
			},
			method,
		}),
	);
}

/** File a report as this session, and hand back the row the API stored. */
async function submit(app: App, description: string, session: Session): Promise<ApiBugReport> {
	const response = await request(app, 'POST', BUGS, session, { description });
	if (response.status !== 200) {
		throw new Error(`submitting a report answered ${String(response.status)}`);
	}
	const payload = (await response.json()) as { data: ApiBugReport };
	return payload.data;
}

/** Point one report at the one that replaced it, or pass `null` to take the link off again. */
function supersede(
	app: App,
	reportId: number,
	successorId: null | number,
	session: Session,
): Promise<Response> {
	return request(app, 'PUT', `${BUGS}/${String(reportId)}/superseded-by`, session, {
		reportId: successorId,
	});
}

/** Read one report back, with both ends of its link on it. */
async function readOne(app: App, id: number, session: Session): Promise<ApiBugReport> {
	const response = await request(app, 'GET', `${BUGS}/${String(id)}`, session);
	if (response.status !== 200) {
		throw new Error(`reading report ${String(id)} answered ${String(response.status)}`);
	}
	const payload = (await response.json()) as { data: ApiBugReport };
	return payload.data;
}

/** The whole inbox, either as it comes by default or with the superseded reports asked for. */
async function listAll(
	app: App,
	session: Session,
	includeSuperseded: boolean,
): Promise<{ data: ApiBugReport[]; total: number }> {
	const query = includeSuperseded ? '?limit=100&includeSuperseded=true' : '?limit=100';
	const response = await request(app, 'GET', `${BUGS}${query}`, session);
	if (response.status !== 200) {
		throw new Error(`listing reports answered ${String(response.status)}`);
	}
	return (await response.json()) as { data: ApiBugReport[]; total: number };
}

/**
 * A migrated, seeded application on a temp-file database, with both sessions the claims need.
 *
 * The reporter is an OPERATOR and the administrator is an ADMIN, because the rule under test has
 * two halves: correcting one's own report needs no privilege, and the inbox stays privileged.
 *
 * @param repoRoot - Absolute path to the repository root, which is where the migrations are.
 * @returns The application, both sessions, and a `dispose` that closes and removes the database.
 */
async function startWorld(repoRoot: string): Promise<Harness> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-bug-supersede-'));
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, and its guard refuses every other route
	// while that flag is set, which would answer each request 403 for an unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const reporterId = seedUserId('OPERATOR');
	const adminId = seedUserId('ADMIN');
	return {
		admin: {
			csrfToken: await generateAndStoreCsrfToken(adminId),
			role: 'ADMIN',
			userId: adminId,
		},
		app: createApiApp(),
		dispose: async () => {
			await closeDatabase();
			try {
				rmSync(tmpDir, { force: true, recursive: true });
			} catch {
				// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
			}
		},
		reporter: {
			csrfToken: await generateAndStoreCsrfToken(reporterId),
			role: 'OPERATOR',
			userId: reporterId,
		},
	};
}

export type { ApiBugReport, App, Session };
export { BUGS, listAll, readOne, startWorld, submit, supersede };
