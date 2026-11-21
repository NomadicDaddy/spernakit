#!/usr/bin/env bun
/**
 * Record the browser runtime the regression suite will use, as `.regression/fingerprint.json`.
 *
 * Enforces: the regression suite's recorded pass can only replay against the runtime it was
 * recorded on. No assertion ID; this is the suite's cache input, not a catalog rule.
 *
 * It runs in every full gate, ahead of test:regression-suite, and is never cached: it launches the
 * managed browser once and writes its version beside Bun's and puppeteer's. The suite lists the
 * file as a cache input, so a different browser, Bun or puppeteer invalidates the suite's recorded
 * pass. The file only changes when the runtime does, so an unchanged runtime keeps the pass.
 */
import { exit } from 'node:process';

import {
	currentFingerprint,
	FINGERPRINT_PATH,
	serialize,
	writeFingerprint,
} from './lib/regression/browser.ts';

export async function runRegressionFingerprint(): Promise<number> {
	try {
		const fingerprint = await currentFingerprint();
		writeFingerprint(fingerprint);
		console.log(`[OK] regression:fingerprint -- ${FINGERPRINT_PATH} records:`);
		console.log(serialize(fingerprint).trimEnd());
		return 0;
	} catch (err) {
		console.error(
			`[FAIL] regression:fingerprint -- ${err instanceof Error ? err.message : String(err)}`,
		);
		return 1;
	}
}

if (import.meta.main) exit(await runRegressionFingerprint());
