#!/usr/bin/env bun
/**
 * Regression coverage for what a form says when the current password is wrong.
 *
 * The defect this gate was written for: entering the wrong current password on the Security tab
 * answered "Invalid username or password. Check your credentials and try again." That sentence
 * belongs to the sign-in form. This form asks for one password and never asks for a username, so
 * the reader could not tell whether the problem was the current password, the new password, or
 * their account. The cause was one error code doing two jobs: the login route uses
 * AUTH_INVALID_CREDENTIALS deliberately uniformly so a failed sign-in cannot be used to enumerate
 * accounts, and the three step-up surfaces reused it, so the browser's message for that code
 * reached a form it was never written for. Two of those surfaces also answered 401, which sends
 * the client into refresh-or-sign-out for a session that was never in question, and the password
 * route sent the raw service token `invalid_credentials` as its message.
 *
 * The property under test is that a step-up rejection says the current password is wrong, from
 * every surface that asks for one, and says it without pretending the session has expired. The
 * gate drives all three routes and reads the browser's message for the code they now carry.
 *
 * It also holds the arrangement that makes that true: a route file that reads a current password
 * out of a body may not answer with the sign-in code. That scan is what would have caught the
 * defect spreading to a fourth surface.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../backend/src/config/configLoader.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { AUTH_ERROR_CODES } from '../shared/src/errorCodes.ts';
import { type App, post, put, seedUserId, startFixture } from './lib/auth-ordering-fixture.ts';
import { generateEcKeyPair } from './lib/crypto-keys.ts';
import {
	findSignInCodeInStepUp,
	SIGN_IN_CODE,
	STEP_UP_CODE,
	STEP_UP_ROUTES,
	type StepUpRoute,
} from './lib/step-up-password.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The route files a step-up surface could live in. */
const ROUTE_SOURCES = [
	'backend/src/routes/users/profile.ts',
	'backend/src/routes/auth/mfa-handlers.ts',
	'backend/src/routes/auth/login.ts',
	'backend/src/routes/auth/mfa.ts',
];

/** Where the browser keeps the sentence it shows for each error code. */
const MESSAGES_MODULE = 'frontend/src/api/errorHandling.ts';

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

/** What one step-up route answered a wrong current password with. */
interface Rejection {
	code: string;
	message: string;
	status: number;
}

/**
 * Send one route a body that is valid except for the current password.
 *
 * @param app - The running fixture application.
 * @param route - The surface to probe.
 * @returns The status, code and message the route answered with.
 */
async function reject(app: App, route: StepUpRoute): Promise<Rejection> {
	const admin = { id: seedUserId('ADMIN'), role: 'ADMIN' as const };
	const csrf = await generateAndStoreCsrfToken(admin.id);
	const send = route.method === 'PUT' ? put : post;
	const response = await send(app, route.path, route.body, admin, csrf);
	const body = (await response.json()) as { code?: string; message?: string };
	/*
	 * The audit plugin writes its record from `onAfterResponse`, which runs once the event loop
	 * turns rather than before `handle` resolves. Yielding here lets each record land while the
	 * database is still open.
	 */
	await new Promise((settled) => setTimeout(settled, 0));
	return { code: body.code ?? '', message: body.message ?? '', status: response.status };
}

/**
 * Every surface that asks for the current password answers the same way when it is wrong.
 *
 * @param app - The running fixture application.
 */
async function checkRejections(app: App): Promise<void> {
	for (const route of STEP_UP_ROUTES) {
		const answer = await reject(app, route);
		assert(
			answer.code === STEP_UP_CODE,
			`${route.surface} must answer a wrong current password with ${STEP_UP_CODE}, ` +
				`not ${answer.code || 'no code at all'}`,
		);
		assert(
			answer.status !== 401,
			`${route.surface} must not answer a wrong current password with 401: the session is ` +
				'not in question, and the client answers a 401 by refreshing the token or signing ' +
				`the user out (it answered ${String(answer.status)})`,
		);
		assert(
			/current password/iu.test(answer.message),
			`${route.surface} must say the current password is wrong, in words a reader can act ` +
				`on (it said ${JSON.stringify(answer.message)})`,
		);
	}
}

/**
 * The browser's sentence for the step-up code names the field and nothing else.
 *
 * Read out of the source rather than imported: the module pulls in the toast layer and the `@/`
 * alias, neither of which resolves from a script.
 */
function browserMessageIsRight(): void {
	const source = readFileSync(join(repoRoot, MESSAGES_MODULE), 'utf8');
	const entry = new RegExp(`${STEP_UP_CODE}:\\s*(?:\\n\\s*)?'([^']*)'`, 'u').exec(source);
	assert(entry !== null, `${MESSAGES_MODULE} must give ${STEP_UP_CODE} a message of its own`);
	if (!entry) return;
	const message = entry[1] ?? '';
	assert(
		/current password/iu.test(message),
		`the browser's message for ${STEP_UP_CODE} must name the current password (it reads ` +
			`${JSON.stringify(message)})`,
	);
	assert(
		!/username/iu.test(message),
		`the browser's message for ${STEP_UP_CODE} must not mention a username, because the form ` +
			`that provokes it never asks for one (it reads ${JSON.stringify(message)})`,
	);
}

/** No route that reads a current password answers with the sign-in code. */
function routesAreClean(): void {
	const found = findSignInCodeInStepUp(repoRoot, ROUTE_SOURCES);
	const offenders = found
		.map((use) => `${use.path}:${String(use.line)} (${use.text})`)
		.join('; ');
	assert(
		found.length === 0,
		`${SIGN_IN_CODE} belongs to the routes that decide whether to let someone in at all: a ` +
			`route that re-checks a current password must answer with ${STEP_UP_CODE} instead, so ` +
			`the browser does not read the sign-in sentence back to a form that asked for one ` +
			`field. Offending lines: ${offenders}`,
	);
}

/** The scan reads what it claims to read. */
function scanStillWorks(): void {
	const uses = findSignInCodeInStepUp(repoRoot, ['backend/src/routes/auth/login.ts']);
	assert(
		uses.length === 0,
		'the login route names the sign-in code legitimately and reads no current password, so ' +
			'the scan must leave it alone',
	);
	assert(
		STEP_UP_ROUTES.length === 3,
		'the corpus must carry every surface that asks for a current password: the password ' +
			'change, the email change, and MFA setup',
	);
	assert(
		(AUTH_ERROR_CODES as Record<string, string>)[STEP_UP_CODE] === STEP_UP_CODE,
		`the shared error codes must carry ${STEP_UP_CODE}, or nothing on either side can name it`,
	);
}

async function run(): Promise<void> {
	scanStillWorks();
	routesAreClean();
	browserMessageIsRight();

	const { app, dispose } = await startFixture(repoRoot);
	try {
		const security = getConfig().security;
		const mfaRoute = STEP_UP_ROUTES.find((route) => route.path === '/api/v1/auth/mfa/setup');
		if (!mfaRoute) throw new Error('The step-up corpus is missing MFA setup');
		security.mfaPrivateKey = '';
		security.mfaPublicKey = '';
		const unconfigured = await reject(app, mfaRoute);
		assert(
			unconfigured.status === 409 &&
				unconfigured.code === AUTH_ERROR_CODES.AUTH_MFA_NOT_CONFIGURED,
			'MFA setup must report missing server keys before checking the current password',
		);

		// Own the prerequisite: a fresh checkout has no workstation MFA signing keys.
		const mfaKeys = generateEcKeyPair();
		security.mfaPrivateKey = mfaKeys.privateKey;
		security.mfaPublicKey = mfaKeys.publicKey;
		await checkRejections(app);
	} finally {
		await dispose();
	}

	if (failures.length > 0) {
		console.error('[FAIL] step-up-password-message:');
		for (const failure of failures) console.error(` - ${failure}`);
		exit(1);
	}
	console.log(
		'[OK] step-up-password-message: a wrong current password is reported as a wrong current password',
	);
}

await run();
