#!/usr/bin/env bun
/**
 * Regression coverage for the browser and the API disagreeing about a username.
 *
 * The defect this gate was written for: the Create User dialog checked that a username was at
 * least two characters and nothing else, so `bad user!` passed in the browser, went to the API,
 * and came back refused by a schema that had always required letters, digits, underscore, dot or
 * hyphen. The dialog also checked a trimmed copy of the field while the submit sent the untrimmed
 * one, so a leading space passed for the same reason. The rule existed in four places by then:
 * the API constants, the registration form, the profile page, and the create dialog, each with
 * its own idea of which clauses mattered.
 *
 * The property under test is that the browser's answer and the API's answer are the same answer.
 * The rule now lives once, in `shared/src/usernamePolicy.ts`, and both sides read it. The gate
 * puts a corpus of names to `validateUsername` and to the real create-user route and requires the
 * two verdicts to match on every one of them.
 *
 * It also holds the arrangement that makes that true: nothing under `frontend/src` or
 * `backend/src` may keep its own copy of the character class or assemble its own verdict out of
 * the shared bounds. That scan is what would have caught the defect, so it is driven over
 * fixtures of the pre-fix shapes as well as over the real tree.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { validateUsername } from '../shared/src/usernamePolicy.ts';
import { type App, post, seedUserId, startFixture } from './lib/auth-ordering-fixture.ts';
import { CANDIDATES, findRivalRules } from './lib/username-parity.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CREATE_USER = '/api/v1/users';

const failures: string[] = [];
/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * Ask the real create-user route about one username.
 *
 * Everything except the username is deliberately valid, and each request carries its own email so
 * a name the route accepts cannot collide with an earlier one. A 400 is the schema refusing the
 * name; anything else means the route was willing to take it.
 *
 * @param app - The running fixture application.
 * @param username - The name to submit, exactly as a form would send it.
 * @param index - Distinguishes this request's email from every other one.
 * @returns The message the API's refusal amounts to, or null when it accepted the name.
 */
async function apiVerdict(app: App, username: string, index: number): Promise<null | string> {
	const admin = { id: seedUserId('ADMIN'), role: 'ADMIN' as const };
	const csrf = await generateAndStoreCsrfToken(admin.id);
	const response = await post(
		app,
		CREATE_USER,
		{
			email: `parity-${String(index)}@example.com`,
			password: 'Parity-Probe-1!',
			username,
		},
		admin,
		csrf,
	);
	/*
	 * The audit plugin writes its record from `onAfterResponse`, which runs once the event loop
	 * turns rather than before `handle` resolves. Yielding here lets each record land while the
	 * database is still open; without it the whole run's audit writes arrive after teardown and
	 * the gate's output fills with recovered write failures.
	 */
	await new Promise((settled) => setTimeout(settled, 0));
	if (response.status === 400) return 'refused';
	return null;
}

/**
 * The parity claim: for every name in the corpus, both sides say yes or both say no.
 *
 * @param app - The running fixture application.
 */
async function checkParity(app: App): Promise<void> {
	for (const [index, candidate] of CANDIDATES.entries()) {
		const browser = validateUsername(candidate.username) !== null;
		const api = (await apiVerdict(app, candidate.username, index)) !== null;
		assert(
			browser === api,
			`the browser and the API must agree about ${JSON.stringify(candidate.username)} ` +
				`(${candidate.reason}): the browser ${browser ? 'refuses' : 'accepts'} it and ` +
				`the API ${api ? 'refuses' : 'accepts'} it`,
		);
	}
}

/** The pre-fix shapes, so the scan is known to see what it was written to see. */
const FIXTURES: Record<string, string> = {
	'bounds-only.tsx': [
		'function getUsernameError(value: string): string | undefined {',
		"\tif (trimmed.length === 0) return 'Username is required';",
		'\tif (trimmed.length < USERNAME_MIN_LENGTH) {',
		'\t\treturn `too short`;',
		'\t}',
		'\treturn undefined;',
		'}',
	].join('\n'),
	'own-pattern.ts': 'const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;\n',
	'reads-the-policy.tsx': [
		"import { validateUsername } from '@/lib/validation';",
		'',
		'function getUsernameError(value: string): string | undefined {',
		'\treturn validateUsername(value.trim()) ?? undefined;',
		'}',
		'',
		'const field = <Input maxLength={USERNAME_MAX_LENGTH} minLength={USERNAME_MIN_LENGTH} />;',
	].join('\n'),
};

/**
 * Drive the scan over the fixtures: the two pre-fix shapes are found, the fixed one is not.
 *
 * The third fixture matters as much as the first two. Passing the bounds to an input's
 * `maxLength` and `minLength` attributes is not a second opinion about anything, and a scan that
 * called it one would push every form into hiding the field's own limits.
 */
function scanStillWorks(): void {
	const dir = mkdtempSync(join(tmpdir(), 'spernakit-username-parity-'));
	try {
		const names = Object.keys(FIXTURES).sort();
		for (const name of names) writeFileSync(join(dir, name), FIXTURES[name] ?? '');
		const found = findRivalRules(dir, names);
		const flagged = new Set(found.map((rule) => rule.path));
		assert(
			flagged.has('bounds-only.tsx'),
			'the scan must flag a form that assembles its own verdict from the shared bounds',
		);
		assert(
			flagged.has('own-pattern.ts'),
			'the scan must flag a file keeping its own copy of the allowed characters',
		);
		assert(
			!flagged.has('reads-the-policy.tsx'),
			'the scan must leave a form alone that defers to the shared validator and passes the ' +
				'bounds to the field as attributes',
		);
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

/**
 * Every TypeScript source under a tree, as paths relative to the repository root.
 *
 * @param tree - The directory to walk, relative to the repository root.
 * @returns Repository-relative paths, using forward slashes whatever the platform uses.
 */
function sourcesUnder(tree: string): string[] {
	return readdirSync(join(repoRoot, tree), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /[.]tsx?$/u.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name).slice(repoRoot.length + 1))
		.map((path) => path.replaceAll('\\', '/'));
}

/** The real tree carries the rule once, in the module that owns it. */
function treeIsClean(): void {
	const files = [...sourcesUnder('frontend/src'), ...sourcesUnder('backend/src')];
	assert(files.length > 0, 'the scan found no sources to read, which cannot be right');
	const found = findRivalRules(repoRoot, files);
	const rivals = found
		.map((rule) => `${rule.path}:${String(rule.line)} ${rule.why} (${rule.text})`)
		.join('; ');
	assert(
		found.length === 0,
		`the username rule belongs to shared/src/usernamePolicy.ts alone: ${rivals}`,
	);
}

async function run(): Promise<void> {
	scanStillWorks();
	treeIsClean();

	const { app, dispose } = await startFixture(repoRoot);
	try {
		await checkParity(app);
	} finally {
		await dispose();
	}

	if (failures.length > 0) {
		console.error('[FAIL] username-parity:');
		for (const failure of failures) console.error(` - ${failure}`);
		exit(1);
	}
	console.log('[OK] username-parity: the browser refuses exactly what the API refuses');
}

await run();
