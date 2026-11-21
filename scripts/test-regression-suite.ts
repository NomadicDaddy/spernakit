#!/usr/bin/env bun
/**
 * Run the application's hand-picked never-break flows, `tests/regression-suite.md`, in a browser.
 *
 * Enforces: the flows an application lists as never-break still work end to end, in every full
 * gate. No assertion ID: the suite is the application's own catalogue of such flows.
 *
 * Each case runs against an isolated instance (lib/regression/instance.ts) on a fresh copy of the
 * seeded database, in the managed browser the regression:fingerprint step recorded, so nothing the
 * developer runs or stores is touched. A case that fails names its step and why, and fails the
 * gate. A repository on a template version that requires the suite and doesn't carry one fails
 * too (lib/regression/presence.ts).
 *
 * `--suite <path>` runs another suite file, which is how the tests prove a broken case fails.
 */
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { currentFingerprint, readFingerprint, serialize } from './lib/regression/browser.ts';
import { REPO_ROOT } from './lib/regression/instance.ts';
import { suitePresence } from './lib/regression/presence.ts';
import { runSuite } from './lib/regression/run.ts';
import { parseSuite, SuiteError } from './lib/regression/suite.ts';

export async function runRegressionSuite(suitePath?: string): Promise<number> {
	let path = suitePath;
	if (path === undefined) {
		const presence = suitePresence(REPO_ROOT);
		if (presence.kind === 'not-yet') {
			console.log(`[SKIP] test:regression-suite -- ${presence.reason}`);
			return 0;
		}
		if (presence.kind === 'missing') {
			console.error(`[FAIL] test:regression-suite -- ${presence.reason}`);
			return 1;
		}
		path = presence.path;
	}
	let cases;
	try {
		cases = parseSuite(readFileSync(path, 'utf8'));
	} catch (err) {
		if (!(err instanceof SuiteError)) throw err;
		console.error(`[FAIL] test:regression-suite -- ${path}: ${err.message}`);
		return 1;
	}
	// The recorded fingerprint is this step's cache input, so it must describe the browser it runs.
	const recorded = readFingerprint();
	if (typeof recorded === 'string') {
		console.error(`[FAIL] test:regression-suite -- ${recorded}`);
		return 1;
	}
	const actual = await currentFingerprint();
	if (serialize(recorded) !== serialize(actual)) {
		console.error(
			'[FAIL] test:regression-suite -- .regression/fingerprint.json is stale; rerun regression:fingerprint.',
		);
		return 1;
	}
	console.log(`Running ${String(cases.length)} regression case(s) from ${path}...`);
	const results = await runSuite(cases);
	const failed = results.filter((result) => result.error !== undefined);
	if (failed.length > 0) {
		console.error(
			`[FAIL] test:regression-suite -- ${String(failed.length)} of ${String(results.length)} case(s) failed: ${failed.map((f) => f.id).join(', ')}.`,
		);
		return 1;
	}
	console.log(`[OK] test:regression-suite -- all ${String(results.length)} case(s) passed.`);
	return 0;
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { suite: { type: 'string' } }, strict: true });
	exit(await runRegressionSuite(values.suite));
}
