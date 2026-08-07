#!/usr/bin/env bun
/**
 * Regression self-test for the shared-core write path.
 *
 * `sync-shared-core.ts --write` overwrites files in other repositories across the whole fleet, and
 * on the real manifest it currently reports "0 file(s) would change" because nothing has drifted.
 * That is a good state for the fleet and a useless one for evidence: a writer never seen to write,
 * and never seen to refuse, is the vacuous gate this subsystem exists to argue against.
 *
 * The synthetic fleet these run against is built by lib/shared-core-write/fixture.ts, which is also
 * where the reasoning about each arranged state lives. This file is the assertions alone: what the
 * classifier must call each state, and what the writer must and must not then do with it.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import { build } from './lib/shared-core-write/fixture.ts';
import { checkGroup } from './lib/shared-core/check.ts';
import { applyFindings, ownershipRefusal } from './lib/shared-core/write.ts';

let assertions = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
	assertions += 1;
	if (!condition) failures.push(label);
}

function equal(label: string, actual: unknown, expected: unknown): void {
	assertions += 1;
	if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

function run(): void {
	const { fleet, group, owner } = build();
	try {
		const before = checkGroup(group, fleet, owner);
		const found = (kind: string, target: string): number =>
			before.findings.filter((f) => f.kind === kind && f.target === target).length;

		equal('foreign hook is classified foreign, not drift', found('foreign-hook', 'foreign'), 1);
		equal(
			'hand-maintained chain is classified local-chain',
			found('local-chain', 'chained'),
			1,
		);
		equal('drifted target reports drift', found('drift', 'drifted'), 2);
		equal('absent target reports uncovered', found('uncovered', 'absent-everything'), 3);
		// Applicability under a foreign dispatcher, which is the distinction that keeps `--write`
		// from delivering a guard nothing will ever invoke. Both repositories are identical except
		// for one line of a hook neither of them got from us.
		equal(
			'a guard the target dispatcher does not chain is not applicable',
			found('not-applicable', 'unreached'),
			1,
		);
		equal(
			'a guard the target dispatcher does chain stays applicable',
			found('not-applicable', 'reached'),
			0,
		);
		equal(
			'a guard reached through a foreign dispatcher is still delivered',
			found('uncovered', 'reached'),
			2, // guard.sh and seed.txt; pre-push itself is unmanaged-dispatch
		);
		equal(
			'a file the hook never chains is unconditional even under a foreign dispatcher',
			found('uncovered', 'unreached'),
			1, // seed.txt alone
		);

		check(
			'a seeded file that differs is not drift',
			!before.findings.some((f) => f.kind === 'drift' && f.detail.includes('seed.txt')),
		);

		// A dry run must exercise every refusal and change nothing on disk.
		const seedBefore = readFileSync(join(fleet, 'drifted', '.githooks', 'seed.txt'), 'utf8');
		const dry = applyFindings(before.findings, fleet, true);
		check('dry run reports work to do', dry.written.length > 0);
		check(
			'dry run wrote nothing',
			readFileSync(join(fleet, 'drifted', '.githooks', 'guard.sh'), 'utf8') === 'guard v1\n',
		);

		const outcome = applyFindings(before.findings, fleet, false);
		equal(
			'dry run predicted the real write exactly',
			dry.written.length,
			outcome.written.length,
		);

		equal(
			'drift is replaced from the owner',
			readFileSync(join(fleet, 'drifted', '.githooks', 'guard.sh'), 'utf8'),
			'guard v2\n',
		);
		equal(
			'an absent file is delivered',
			readFileSync(join(fleet, 'absent-everything', '.githooks', 'guard.sh'), 'utf8'),
			'guard v2\n',
		);
		equal(
			'a seeded file is written once and then left alone',
			seedBefore,
			'seed edited locally\n',
		);
		equal(
			'the seeded file was not overwritten',
			readFileSync(join(fleet, 'drifted', '.githooks', 'seed.txt'), 'utf8'),
			'seed edited locally\n',
		);

		check(
			'the guard was never delivered to the repository that does not run it',
			!existsSync(join(fleet, 'unreached', '.githooks', 'guard.sh')),
		);
		equal(
			'the guard was delivered to the repository that does run it',
			readFileSync(join(fleet, 'reached', '.githooks', 'guard.sh'), 'utf8'),
			'guard v2\n',
		);

		equal('uncommitted work is refused', outcome.blocked.length, 1);
		equal(
			'the refused file is untouched',
			readFileSync(join(fleet, 'dirty', '.githooks', 'guard.sh'), 'utf8'),
			'guard v1 + local work\n',
		);
		equal(
			'a foreign hook is never claimed',
			readFileSync(join(fleet, 'foreign', '.githooks', 'pre-push'), 'utf8'),
			'#!/bin/sh\n# husky\n',
		);
		equal(
			'a hand-maintained chain is never overwritten',
			readFileSync(join(fleet, 'chained', '.githooks', 'pre-push'), 'utf8'),
			'#!/bin/sh\n# OURS\n# LOCAL CHAIN\nlint\n',
		);

		// The point of taking the worklist from the classifier: everything the checker refused to
		// call writable arrives here with no destination and is skipped without a second rule.
		check(
			'unwritable findings carry no destination',
			before.findings
				.filter((f) => f.kind !== 'drift' && f.kind !== 'uncovered')
				.every((f) => f.destination === undefined),
		);

		// Ownership: this group is aidd's, so the writer must refuse it from anywhere else.
		check('a non-owner is refused', ownershipRefusal(group, join(fleet, 'drifted')) !== null);
		equal('the owner is accepted', ownershipRefusal(group, owner), null);
		check(
			'a directory with no package.json cannot claim ownership',
			ownershipRefusal(group, fleet) !== null,
		);

		// Idempotence by content: a second pass over a synced fleet must find nothing left to do.
		const after = checkGroup(group, fleet, owner);
		equal(
			'the second pass has no drift',
			after.findings.filter((f) => f.kind === 'drift').length,
			1, // the refused dirty target, still divergent by design
		);
		equal(
			'every clean target is now current',
			after.findings.filter((f) => f.kind === 'uncovered').length,
			0,
		);
	} finally {
		if (existsSync(fleet)) rmSync(fleet, { force: true, recursive: true });
	}
}

run();

if (failures.length > 0) {
	console.error(`shared-core write self-test FAILED (${failures.length} of ${assertions}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(`shared-core write self-test passed (${assertions} assertions).`);
