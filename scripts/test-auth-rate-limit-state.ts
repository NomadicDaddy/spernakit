#!/usr/bin/env bun
/**
 * Regression coverage for Settings reporting auth rate limiting as active while nothing throttles.
 *
 * The defect this gate was written for: auth limiting is in effect only when two switches agree.
 * `authRateLimitEnabled` is the record a SYSOP edits in Settings, and `rateLimit.authEnabled` is
 * the pre-boot kill-switch a deployment sets in its config file. The plugin required both, but
 * `GET /settings/auth-security` reported only the first, so Settings > Authentication showed the
 * switch on and said "Repeated auth requests from one IP are throttled." on a deployment where
 * every auth request went straight through. Settings > Runtime Config, reading the config half,
 * said the opposite on the same screen. An administrator had no way to tell which page was
 * describing their system.
 *
 * The property under test is agreement: what the settings API reports about auth rate limiting has
 * to match what an auth request actually meets. The gate asserts that against the real application
 * in both config states, checks that the config half travels as its own read-only field rather
 * than pre-combined with the editable one, and reads the sources that would have to change for the
 * two halves to drift apart again.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { App, Claim } from './lib/auth-ordering-fixture.ts';

import { getConfig } from '../backend/src/config/configLoader.ts';
import { get, post, seedUserId, startFixture } from './lib/auth-ordering-fixture.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = '/api/v1/settings/auth-security';
const LOGIN = '/api/v1/auth/login';
/**
 * Enough failed sign-ins to pass the per-IP allowance well over.
 *
 * The stored default is ten per fifteen minutes, so a burst of this size is refused before it ends
 * when limiting is on, and is answered on its own terms every time when limiting is off. A name no
 * account carries keeps the burst away from account lockout, which counts failures for real users
 * and would refuse for a different reason.
 */
const BURST = 14;
const ABSENT_ACCOUNT = 'no-such-account-for-the-rate-limit-gate';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** The settings payload, as far as this gate reads it. */
interface ReportedState {
	authRateLimitEnabled?: boolean;
	authRateLimitEnabledInConfig?: boolean;
}

/**
 * Read the settings the Authentication page reads, as the ADMIN role it requires.
 *
 * @param app - The running fixture application.
 * @param admin - The signed-in ADMIN the page is rendered for.
 * @returns The reported state, or an empty object when the read itself failed.
 */
async function readReportedState(app: App, admin: Claim): Promise<ReportedState> {
	const response = await get(app, SETTINGS, admin);
	if (response.status !== 200) {
		failures.push(`${SETTINGS} must answer 200 for an ADMIN, got ${String(response.status)}`);
		return {};
	}
	const body = (await response.json()) as { data?: ReportedState };
	return body.data ?? {};
}

/**
 * Send a burst of failed sign-ins and report whether any of them was refused as rate limited.
 *
 * @param app - The running fixture application.
 * @returns True when at least one attempt came back 429.
 */
async function burstIsThrottled(app: App): Promise<boolean> {
	let throttled = false;
	for (let attempt = 0; attempt < BURST; attempt += 1) {
		const response = await post(app, LOGIN, {
			password: 'not-the-password',
			username: ABSENT_ACCOUNT,
		});
		if (response.status === 429) throttled = true;
	}
	return throttled;
}

/**
 * With the config kill-switch off, the page must say so and the requests must go unthrottled.
 *
 * This is the reported defect exactly: the stored setting stays on, because nobody turned it off,
 * and the deployment has limiting disabled before boot. Both halves are asserted in the same state
 * so a fix that reported the config half but left the plugin reading its own copy of the rule, or
 * the reverse, still fails here.
 *
 * @param app - The running fixture application.
 * @param admin - The signed-in ADMIN the settings are read as.
 */
async function configOffIsReportedAndReal(app: App, admin: Claim): Promise<void> {
	getConfig().rateLimit.authEnabled = false;

	const state = await readReportedState(app, admin);
	assert(
		state.authRateLimitEnabled === true,
		`the stored setting must still read as on, got ${String(state.authRateLimitEnabled)}`,
	);
	assert(
		state.authRateLimitEnabledInConfig === false,
		'the settings response must carry the config kill-switch as authRateLimitEnabledInConfig, ' +
			`and it must be false here, got ${String(state.authRateLimitEnabledInConfig)}`,
	);
	assert(
		!(await burstIsThrottled(app)),
		'no auth request may be refused as rate limited while the config kill-switch is off',
	);
}

/**
 * With both switches on, the page must say so and the requests must actually be refused.
 *
 * Without this half the gate would pass on a field hard-coded to false. It runs second because the
 * burst above records nothing while limiting is off, so this burst starts from an empty counter.
 *
 * @param app - The running fixture application.
 * @param admin - The signed-in ADMIN the settings are read as.
 */
async function configOnIsReportedAndReal(app: App, admin: Claim): Promise<void> {
	getConfig().rateLimit.authEnabled = true;

	const state = await readReportedState(app, admin);
	assert(
		state.authRateLimitEnabledInConfig === true,
		`authRateLimitEnabledInConfig must follow config rather than being a constant, got ${String(state.authRateLimitEnabledInConfig)}`,
	);
	assert(
		await burstIsThrottled(app),
		`${String(BURST)} failed sign-ins must be refused as rate limited once both switches are on`,
	);
}

/**
 * The rule has one home, and the config half is reported rather than accepted.
 *
 * Three things a later change could get wrong that no single request would notice. The plugin
 * could go back to spelling the rule itself, which is how the two halves drifted apart the first
 * time. The PUT body could start accepting the config field, which would let a SYSOP appear to
 * change something only a config edit and a restart can change. And the card could go back to its
 * unconditional description, which is the sentence an administrator actually read.
 */
function theRuleLivesInOnePlace(): void {
	const read = (...parts: string[]): string => readFileSync(join(repoRoot, ...parts), 'utf8');

	const plugin = read('backend', 'src', 'plugins', 'rateLimit', 'authRateLimitPlugin.ts');
	assert(
		plugin.includes('isAuthRateLimitInEffect'),
		'the auth rate limit plugin must ask isAuthRateLimitInEffect rather than deciding itself',
	);
	assert(
		!plugin.includes('rateLimit.authEnabled'),
		'the auth rate limit plugin must not read rateLimit.authEnabled directly: that is the ' +
			'duplicated rule the settings API drifted away from',
	);

	const route = read('backend', 'src', 'routes', 'settings', 'auth-security.ts');
	const bodySchema = route.slice(route.indexOf('body: t.Object({'));
	assert(
		!bodySchema.slice(0, bodySchema.indexOf('}),')).includes('authRateLimitEnabledInConfig'),
		'the settings PUT body must not accept authRateLimitEnabledInConfig: it reports config, ' +
			'which this API cannot change',
	);

	const section = read(
		'frontend',
		'src',
		'pages',
		'settings',
		'auth',
		'AuthRateLimitSection.tsx',
	);
	assert(
		section.includes('authRateLimitEnabledInConfig'),
		'the Auth Rate Limiting card must read the config half before describing what it does',
	);
}

async function run(): Promise<void> {
	const { app, dispose } = await startFixture(repoRoot);
	const admin: Claim = { id: seedUserId('ADMIN'), role: 'ADMIN' };

	await configOffIsReportedAndReal(app, admin);
	await configOnIsReportedAndReal(app, admin);
	theRuleLivesInOnePlace();

	await dispose();

	if (failures.length === 0) {
		console.log(
			`[OK] auth-rate-limit-state: both config states reported and enforced alike, over ${String(BURST * 2)} sign-in attempts`,
		);
		process.exit(0);
	}
	console.error('[FAIL] auth-rate-limit-state:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-auth-rate-limit-state:', err);
	process.exit(1);
});
