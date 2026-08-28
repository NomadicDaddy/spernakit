#!/usr/bin/env bun
/**
 * Regression coverage for the bug intake rejecting a description that is empty once trimmed
 * (`.aidd/features/remediation-20260827-whitespace-only-bug-report-description`).
 *
 * The defect this gate was written for: `POST /api/v1/bugs` checked `minLength: 1` against the
 * string exactly as submitted, and `bugReportService.submit` trimmed it afterwards. A description
 * of nothing but spaces therefore passed validation, trimmed away to nothing, and was stored as a
 * row titled `(untitled)` with an empty body. Reports are closed by status rather than deleted and
 * the PATCH route changes only the status, so that row could never be corrected or removed.
 *
 * The property under test is that the value the schema is shown is the value that gets stored. The
 * route now trims every field the service trims at the transform stage, which is the stage before
 * validation, so nothing can satisfy a constraint and then fail to satisfy it once stored.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UserRole } from '../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { bugReports } from '../backend/src/db/schema/bugReports.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
const BUGS = '/api/v1/bugs';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

type App = ReturnType<typeof createApiApp>;

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

/** What one submitting session carries: the account it acts as and that account’s CSRF token. */
interface Session {
	csrfToken: string;
	userId: number;
}

/** Submit a report as the seeded OPERATOR, which is all the route asks for. */
function submit(app: App, body: unknown, session: Session): Promise<Response> {
	const config = getConfig();
	const token = signAccessToken({ id: session.userId, role: 'OPERATOR' });
	return app.handle(
		new Request(`http://localhost${BUGS}`, {
			body: JSON.stringify(body),
			headers: {
				'content-type': 'application/json',
				cookie: `${config.security.authCookieName}=${token}`,
				origin: config.server.frontendUrl,
				'X-CSRF-Token': session.csrfToken,
			},
			method: 'POST',
		}),
	);
}

/** How many reports the table holds, so a rejected submission can be shown to have stored nothing. */
function storedCount(): number {
	return getDb().select().from(bugReports).all().length;
}

/**
 * A description with nothing in it once trimmed is refused, and nothing is written.
 *
 * The three shapes are the ones that used to slip through: spaces alone, the whitespace a text area
 * produces when someone hits tab and return, and a description that is empty only after a single
 * trailing newline comes off. Each carries at least one character, so each satisfied the old
 * `minLength: 1` check against the untrimmed string.
 */
async function emptyAfterTrimIsRefused(app: App, session: Session): Promise<void> {
	const cases: { description: string; label: string }[] = [
		{ description: '     ', label: 'spaces only' },
		{ description: '\t\n \t\n', label: 'tabs and newlines only' },
		{ description: '\n', label: 'a single newline' },
	];
	const before = storedCount();
	for (const item of cases) {
		const response = await submit(app, { description: item.description }, session);
		assert(
			response.status === 400,
			`a description of ${item.label} must be refused with 400, got ${String(response.status)}`,
		);
		const body = await response.text();
		assert(
			body.includes('description'),
			`the refusal for ${item.label} must name the description field: ${body}`,
		);
	}
	assert(
		storedCount() === before,
		'a refused submission must store nothing, but the report count moved',
	);
}

/**
 * A description that opens with a blank line is accepted and named after what it says.
 *
 * Trimming before validation means the stored description no longer begins with the blank line, so
 * the title comes from the first thing the reporter actually wrote rather than the placeholder.
 */
async function blankFirstLineIsAccepted(app: App, session: Session): Promise<void> {
	const description = '\n\nThe export button does nothing\nIt happens on every dashboard.\n';
	const response = await submit(app, { description }, session);
	assert(
		response.status === 200,
		`a description that only opens with a blank line must be accepted, got ${String(response.status)}`,
	);
	if (response.status !== 200) return;

	const payload = (await response.json()) as { data: { description: string; title: string } };
	assert(
		payload.data.description === description.trim(),
		`the stored description must be the trimmed one, got ${JSON.stringify(payload.data.description)}`,
	);
	assert(
		payload.data.title === 'The export button does nothing',
		`the title must come from the first line that carries something, got ${JSON.stringify(payload.data.title)}`,
	);
}

/**
 * Every field the service trims is trimmed before validation, not only the description.
 *
 * `submit` also trims the optional email, so an address padded with spaces used to be checked
 * against `format: 'email'` with the padding still on it and refused for a value the service would
 * have accepted. The rule is the ordering, not the one field it was reported against.
 */
async function paddedEmailIsTrimmedFirst(app: App, session: Session): Promise<void> {
	const response = await submit(
		app,
		{ description: '  Padded email should still work  ', email: '  reporter@example.com  ' },
		session,
	);
	assert(
		response.status === 200,
		`a padded email must be trimmed before it is validated, got ${String(response.status)}`,
	);
	if (response.status !== 200) return;

	const payload = (await response.json()) as { data: { description: string; email: string } };
	assert(
		payload.data.email === 'reporter@example.com',
		`the stored email must be the trimmed one, got ${JSON.stringify(payload.data.email)}`,
	);
	assert(
		payload.data.description === 'Padded email should still work',
		`the stored description must be the trimmed one, got ${JSON.stringify(payload.data.description)}`,
	);
}

/**
 * The placeholder title is unreachable through the API, and the source says why it is still there.
 *
 * `deriveTitle` keeps its `(untitled)` branch for rows written before the route trimmed ahead of
 * validating. A reader who finds a branch nothing can reach deserves to be told that, so the
 * comment is part of the contract rather than decoration.
 */
function placeholderIsExplained(): void {
	const source = readFileSync(
		join(repoRoot, 'backend', 'src', 'services', 'bugReportService.ts'),
		'utf8',
	);
	const index = source.indexOf("return '(untitled)'");
	assert(index >= 0, 'deriveTitle no longer has the placeholder branch this assertion describes');
	if (index < 0) return;

	const preceding = source.slice(Math.max(0, index - 500), index);
	assert(
		preceding.includes('trimming') && preceding.includes('//'),
		'the placeholder branch must carry a comment saying it is kept for rows stored before the trim',
	);
	assert(
		getDb()
			.select()
			.from(bugReports)
			.all()
			.every((report) => report.title !== '(untitled)'),
		'no report reaching the database through the API may be titled with the placeholder',
	);
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-bug-whitespace-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, and its guard refuses every other route
	// while that flag is set, which would answer each submission 403 for an unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const app = createApiApp();
	const userId = seedUserId('OPERATOR');
	// The route is state changing, so every submission needs the session-bound CSRF token the
	// real client sends; without it the request is refused before the schema is ever consulted.
	const session: Session = { csrfToken: await generateAndStoreCsrfToken(userId), userId };
	await emptyAfterTrimIsRefused(app, session);
	await blankFirstLineIsAccepted(app, session);
	await paddedEmailIsTrimmedFirst(app, session);
	placeholderIsExplained();

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('[OK] bug-report-whitespace: an empty description is refused, not stored');
		process.exit(0);
	}
	console.error('[FAIL] bug-report-whitespace:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-bug-report-whitespace:', err);
	process.exit(1);
});
