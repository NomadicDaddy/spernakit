#!/usr/bin/env bun
/**
 * Regression test for crawltest's login credentials being resolved, not stored.
 *
 * `backend/src/config/defaults.json` is tracked, so it can never carry a concrete credential and
 * ships `testing.crawlLoginEmail` and `testing.crawlLoginPassword` blank. Every derived app then
 * filled them with its own SYSOP seed account by hand, and several pinned the entire file as a
 * `.templateoverrides` SKIP to keep doing so. The values were never app-specific — in every
 * observed case the value is whatever that app's own seed script creates — so they are resolved
 * from the seed source at read time instead.
 *
 * Three properties have to hold together:
 *
 *   1. Both ends read the SAME source. `scripts/crawltest.ts` signs in as the SYSOP seed account
 *      and the seed exempts that same address from a forced password change; if they disagree,
 *      passwordChangeGuard bounces every request the crawl makes and the run reports a wall of
 *      failures that have nothing to do with the app.
 *   2. Config still wins, per key. An app that renamed only its crawl account must not be handed
 *      the seed address back, and must not silently keep the seed password either.
 *   3. An unresolvable login stops the run. An anonymous crawl does not fail loudly — it reports a
 *      shallow public site, which reads as a successful test run — so "no credential" has to be an
 *      error, not a mode.
 *
 * The tracked config files are pinned blank here too: a concrete credential landing back in
 * defaults.json would satisfy every resolution assertion below while reintroducing the finding.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import {
	getSeedCredential,
	getSeedUsersWithPasswords,
	resolveCrawlEmail,
	type SeedCredential,
} from '../backend/src/utils/auth/passwordGenerator.ts';
import { resolveCrawlLogin } from './crawltest-config.ts';

const EMAIL_KEY = 'testing.crawlLoginEmail';
const PASSWORD_KEY = 'testing.crawlLoginPassword';

/** A derived app whose seed defines no SYSOP user, and a production seed: nothing to fall back to. */
const NO_SEED: SeedCredential | undefined = undefined;

const APP_EMAIL = 'crawler@derivedapp.test';
const APP_PASSWORD = 'not-the-seed-password';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');

function readJson(relativePath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf-8')) as Record<
		string,
		unknown
	>;
}

/** The `testing` section of a tracked config file. */
function readTestingSection(relativePath: string): Record<string, unknown> {
	const testing = readJson(relativePath)['testing'];
	assert(
		typeof testing === 'object' && testing !== null,
		`${relativePath} must still have a testing section`,
	);
	return testing as Record<string, unknown>;
}

try {
	// 1. The lookup resolves the SYSOP seed account, and resolves it to the credential the seed
	//    actually creates — not a second copy of it that could drift.
	const sysop = getSeedCredential('SYSOP');
	assert(sysop !== undefined, 'A SYSOP development-seed credential must be resolvable');
	const seededSysop = getSeedUsersWithPasswords(false).find((user) => user.role === 'SYSOP');
	assert(seededSysop !== undefined, 'The development seed must still create a SYSOP user');
	assert(
		sysop?.email === seededSysop?.email && sysop?.password === seededSysop?.password,
		'getSeedCredential must return the credential the development seed writes, not a copy',
	);

	// 2. A role no seed user holds resolves to nothing rather than to an arbitrary account.
	assert(
		getSeedCredential('VIEWER')?.email === 'viewer@example.com',
		'getSeedCredential must resolve by role, not by position',
	);

	// 3. Blank config (the shipped template default) falls back to the seed for both keys.
	const seeded = resolveCrawlLogin({ crawlLoginEmail: '', crawlLoginPassword: '' }, sysop);
	assert(
		seeded.login?.email === sysop?.email && seeded.login?.password === sysop?.password,
		'Blank crawl keys must resolve to the SYSOP development-seed credential',
	);
	assert(seeded.unresolved.length === 0, 'A resolved login must report no unresolved keys');
	assert(
		seeded.fromSeed.includes(EMAIL_KEY) && seeded.fromSeed.includes(PASSWORD_KEY),
		'A fully seed-resolved login must report both keys as coming from the seed',
	);

	// An absent testing section behaves the same as a blank one.
	assert(
		resolveCrawlLogin(undefined, sysop).login?.email === sysop?.email,
		'A config with no testing section at all must still resolve from the seed',
	);

	// 4. Config wins per key: setting only the email keeps that email and takes the seed password.
	const emailOnly = resolveCrawlLogin(
		{ crawlLoginEmail: APP_EMAIL, crawlLoginPassword: '' },
		sysop,
	);
	assert(
		emailOnly.login?.email === APP_EMAIL && emailOnly.login?.password === sysop?.password,
		'A configured email must win while only the missing password falls back to the seed',
	);
	assert(
		emailOnly.fromSeed.length === 1 && emailOnly.fromSeed[0] === PASSWORD_KEY,
		`A partially resolved login must attribute only ${PASSWORD_KEY} to the seed`,
	);

	const passwordOnly = resolveCrawlLogin(
		{ crawlLoginEmail: '', crawlLoginPassword: APP_PASSWORD },
		sysop,
	);
	assert(
		passwordOnly.login?.email === sysop?.email && passwordOnly.login?.password === APP_PASSWORD,
		'A configured password must win while only the missing email falls back to the seed',
	);

	// 5. A fully configured login never consults the seed.
	const configured = resolveCrawlLogin(
		{ crawlLoginEmail: APP_EMAIL, crawlLoginPassword: APP_PASSWORD },
		sysop,
	);
	assert(
		configured.login?.email === APP_EMAIL && configured.login?.password === APP_PASSWORD,
		'A fully configured login must be used verbatim',
	);
	assert(
		configured.fromSeed.length === 0,
		'A fully configured login must attribute nothing to the seed',
	);

	// 6. Nothing to fall back to: fail, and name every key that could not be resolved. This is the
	//    branch that replaces the silent anonymous crawl.
	const nothing = resolveCrawlLogin({ crawlLoginEmail: '', crawlLoginPassword: '' }, NO_SEED);
	assert(nothing.login === null, 'An unresolvable login must not produce credentials');
	assert(
		nothing.unresolved.includes(EMAIL_KEY) && nothing.unresolved.includes(PASSWORD_KEY),
		`An unresolvable login must name both ${EMAIL_KEY} and ${PASSWORD_KEY}`,
	);

	const halfUnresolvable = resolveCrawlLogin({ crawlLoginEmail: APP_EMAIL }, NO_SEED);
	assert(halfUnresolvable.login === null, 'A half-resolvable login must still fail');
	assert(
		halfUnresolvable.unresolved.length === 1 && halfUnresolvable.unresolved[0] === PASSWORD_KEY,
		`A half-resolvable login must name only ${PASSWORD_KEY}, not the key that resolved`,
	);

	// 7. The seeding end resolves the same account, so the crawl user is exempted from a forced
	//    password change — and production, where seed passwords are random, is left alone.
	assert(
		resolveCrawlEmail('', false) === sysop?.email,
		'A dev seed with no configured crawl email must exempt the same account crawltest signs in as',
	);
	assert(
		resolveCrawlEmail(APP_EMAIL, false) === APP_EMAIL,
		'A configured crawl email must win on the seeding side too',
	);
	assert(
		resolveCrawlEmail('', true) === undefined,
		'A production seed must not exempt a default-addressed SYSOP account from its password change',
	);
	assert(
		resolveCrawlEmail(APP_EMAIL, true) === APP_EMAIL,
		'A production seed must still honour an explicitly configured crawl email',
	);

	// 8. No concrete credential may sit in a tracked configuration file — that is the finding.
	for (const trackedConfig of ['backend/src/config/defaults.json', 'config/example.json']) {
		const testing = readTestingSection(trackedConfig);
		assert(
			testing['crawlLoginEmail'] === '' && testing['crawlLoginPassword'] === '',
			`${trackedConfig} is tracked and must ship both crawl login keys blank`,
		);
	}

	console.log(`Crawl credential resolution regression test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
}
