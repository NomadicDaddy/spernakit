#!/usr/bin/env bun
/**
 * Regression test for the AHEAD expiry on `.templateoverrides` SKIP and KEEP entries.
 *
 * An entry an app took because it was ahead of the template is meant to go at the upgrade that
 * brings the template level. Written as free text it never went: one derived app still SKIPped four
 * leak-guard and hook files "AHEAD" of a tag the template had long passed. The marker makes the
 * expiry machine-readable, and check:override-deltas fails once the selected upgrade target reaches
 * it. The cases drive the real CLI against the two-tag fixture (an app pinned at v9.0.0, a template
 * tagged v9.0.0 and v9.1.0), so the upgrade target and the app's own pin are genuinely different.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

import {
	AGREED,
	createOverrideDeltaFixture,
	NGINX,
	TARGET_NGINX,
} from './lib/template/override-deltas-fixture.ts';
import { compareVersions, parseAheadMarker } from './lib/template/overrides-ahead.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

/** The git blob id of `content`, as `git rev-parse <tag>:<path>` would print it. */
function blobOf(content: string): string {
	const result = Bun.spawnSync(['git', 'hash-object', '--stdin'], {
		stderr: 'pipe',
		stdin: Buffer.from(content),
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error('git hash-object failed');
	return result.stdout.toString().trim();
}

// ===== The marker grammar, on its own. =====
assert(parseAheadMarker('app image labels') === null, 'A reason without AHEAD is not a marker');
assert(
	JSON.stringify(parseAheadMarker('AHEAD until 3.52.0: hook sync')) ===
		JSON.stringify({ kind: 'version', version: '3.52.0' }),
	'A version expiry parses, with the reason after it',
);
assert(
	JSON.stringify(parseAheadMarker('AHEAD until blob 2ebe968b72')) ===
		JSON.stringify({ hash: '2ebe968b72', kind: 'blob' }),
	'A blob expiry parses',
);
assert(
	parseAheadMarker('AHEAD, not kept: byte-identical to spernakit HEAD') === 'malformed',
	'The fleet free-text form names no expiry, so it is malformed',
);
assert(parseAheadMarker('AHEAD until 3.52') === 'malformed', 'A two-part version is malformed');
assert(parseAheadMarker('AHEAD until blob 2eb') === 'malformed', 'A too-short hash is malformed');
assert(compareVersions('9.10.0', '9.9.0') === 1, 'Versions compare numerically, not as text');
assert(compareVersions('9.1.0', '9.1.0') === 0, 'Equal versions compare equal');

const fixture = createOverrideDeltaFixture(join(import.meta.dir, '..'));
const nginxBlob = blobOf(TARGET_NGINX);

try {
	// ===== 1. Unexpired: the target has not reached the expiry, so the entry stands. =====
	fixture.writeOverrides([`KEEP  ${AGREED}  # AHEAD until 9.2.0: waits for the next template`]);
	const unexpired = fixture.run(['--target-version', '9.1.0']);
	assert(unexpired.exitCode === 0, `An unexpired AHEAD entry must pass:\n${unexpired.output}`);
	assert(!unexpired.output.includes('Expired AHEAD'), 'An unexpired entry must not be reported');

	// ===== 2. Old pin, expired target: the app is on 9.0.0 and upgrades straight to 9.1.0. =====
	fixture.writeOverrides([`KEEP  ${AGREED}  # AHEAD until 9.1.0: taken early from the template`]);
	const before = fixture.run(['--target-version', '9.0.0']);
	assert(before.exitCode === 0, `Below its expiry the entry passes:\n${before.output}`);
	const expired = fixture.run(['--target-version', '9.1.0']);
	assert(expired.exitCode === 1, `A target at the expiry must fail:\n${expired.output}`);
	assert(
		expired.output.includes(`KEEP ${AGREED} (.templateoverrides line 1)`) &&
			expired.output.includes('AHEAD until 9.1.0'),
		`The failure must name the entry, its file and its line:\n${expired.output}`,
	);

	// ===== 3. Blob expiry: the target's copy of the path is the blob the entry waits for. =====
	fixture.writeOverrides([
		`SKIP  ${NGINX}  # AHEAD until blob ${nginxBlob.slice(0, 12)}: CSP fix`,
	]);
	const notYet = fixture.run(['--target-version', '9.0.0']);
	assert(
		!notYet.output.includes('Expired AHEAD'),
		`v9.0.0's ${NGINX} is a different blob, so the entry stands:\n${notYet.output}`,
	);
	const matched = fixture.run(['--target-version', '9.1.0']);
	assert(matched.exitCode === 1, `A matching target blob must fail:\n${matched.output}`);
	assert(
		matched.output.includes(`SKIP ${NGINX}`) && matched.output.includes('is that blob'),
		`The failure must name the entry and the blob match:\n${matched.output}`,
	);

	// ===== 4. Malformed: warned about by line, and otherwise an ordinary override. =====
	fixture.writeOverrides([`KEEP  ${AGREED}  # AHEAD, not kept: remove at the next dance`]);
	const malformed = fixture.run(['--target-version', '9.1.0']);
	assert(
		malformed.exitCode === 0,
		`A malformed marker must not fail the check:\n${malformed.output}`,
	);
	assert(
		malformed.output.includes('line 1 says AHEAD but names no expiry'),
		`A malformed marker must be warned about with its line:\n${malformed.output}`,
	);

	// ===== 5. No marker: exactly as before. =====
	fixture.writeOverrides([`KEEP  ${AGREED}  # kept in sync by hand`]);
	const plain = fixture.run(['--target-version', '9.1.0']);
	assert(plain.exitCode === 0, `An entry without a marker passes as before:\n${plain.output}`);
	assert(
		!plain.output.includes('AHEAD'),
		`An entry without a marker gets no AHEAD output:\n${plain.output}`,
	);

	// ===== 6. A later line for the same action and path replaces the expiry with its reason. =====
	for (const replacement of ['kept in sync by hand', 'AHEAD, not kept: hand-synced']) {
		fixture.writeOverrides([
			`KEEP  ${AGREED}  # AHEAD until 9.1.0: taken early`,
			`KEEP  ${AGREED}  # ${replacement}`,
		]);
		const replaced = fixture.run(['--target-version', '9.1.0']);
		assert(
			replaced.exitCode === 0 && !replaced.output.includes('Expired AHEAD'),
			`A replacement "${replacement}" must leave no stale expiry behind:\n${replaced.output}`,
		);
	}

	// ===== 7. KEEP and SKIP on one path keep separate expiries, in either order. =====
	for (const lines of [
		[`SKIP  ${AGREED}  # AHEAD until 9.1.0: a`, `KEEP  ${AGREED}  # AHEAD until 9.2.0: b`],
		[`KEEP  ${AGREED}  # AHEAD until 9.2.0: b`, `SKIP  ${AGREED}  # AHEAD until 9.1.0: a`],
	]) {
		fixture.writeOverrides(lines);
		const both = fixture.run(['--target-version', '9.1.0']);
		const skipLine = lines.findIndex((text) => text.startsWith('SKIP')) + 1;
		assert(
			both.exitCode === 1 &&
				both.output.includes(
					`SKIP ${AGREED} (.templateoverrides line ${String(skipLine)})`,
				),
			`The expired SKIP must fail with its own line, whatever the KEEP says:\n${both.output}`,
		);
		assert(
			!both.output.includes(`KEEP ${AGREED} (`),
			`The unexpired KEEP on the same path must not be reported:\n${both.output}`,
		);
	}

	console.log(`[OK] AHEAD override expiry test passed (${String(checks)} checks).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
