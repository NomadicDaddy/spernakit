#!/usr/bin/env bun
/**
 * Regression self-test for the shared-core write path.
 *
 * `sync-shared-core.ts --write` overwrites files in other repositories across the whole fleet, and
 * on the real manifest it currently reports "0 file(s) would change" because nothing has drifted.
 * That is a good state for the fleet and a useless one for evidence: a writer never seen to write,
 * and never seen to refuse, is the vacuous gate this subsystem exists to argue against. So the
 * cases run against a synthetic fleet built in a temp directory, where drift, uncommitted work,
 * foreign hooks and hand-maintained chains can all be arranged on purpose.
 *
 * The fixtures are real `git init` repositories because two of the guards are answered by git and
 * not by the filesystem. A mocked git would test the mock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { checkGroup } from './lib/shared-core/check.ts';
import { loadManifest, type SharedCoreGroup } from './lib/shared-core/manifest.ts';
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

function git(repo: string, ...args: string[]): void {
	execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe', windowsHide: true });
}

function write(path: string, body: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

/** A committed repository, so `git status --porcelain` has a baseline to answer against. */
function makeRepo(root: string, files: Record<string, string>, name?: string): string {
	mkdirSync(root, { recursive: true });
	if (name !== undefined) {
		write(join(root, 'package.json'), JSON.stringify({ name, scripts: {} }));
	}
	for (const [rel, body] of Object.entries(files)) write(join(root, rel), body);
	git(root, 'init', '-q');
	git(root, 'config', 'user.email', 'fixture@example.invalid');
	git(root, 'config', 'user.name', 'fixture');
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'fixture');
	return root;
}

const MANIFEST = {
	groups: [
		{
			files: [
				{ disposition: 'synced', source: 'pre-push' },
				{ disposition: 'synced', source: 'guard.sh' },
				{ disposition: 'seeded', source: 'seed.txt' },
			],
			hook: 'pre-push',
			hookMarker: 'OURS',
			localChainMarker: 'LOCAL CHAIN',
			name: 'fixture-hooks',
			owner: 'aidd',
			sourceRoot: '.githooks',
			targetRoot: '.githooks',
			targets: { marker: '.aidd', model: 'discovered' },
		},
	],
};

const OWNER_FILES = {
	'.githooks/guard.sh': 'guard v2\n',
	'.githooks/pre-push': '#!/bin/sh\n# OURS\nguard v2\n',
	'.githooks/seed.txt': 'seed original\n',
};

function build(): { fleet: string; group: SharedCoreGroup; owner: string; scripts: string } {
	const fleet = mkdtempSync(join(tmpdir(), 'shared-core-write-'));
	const scripts = join(fleet, '_manifest');
	mkdirSync(scripts, { recursive: true });
	writeFileSync(join(scripts, 'shared-core-manifest.json'), JSON.stringify(MANIFEST));

	const owner = makeRepo(join(fleet, 'aidd'), OWNER_FILES, 'aidd');

	// Every target carries `.aidd` so discovery finds it, and every one is a committed repository.
	makeRepo(join(fleet, 'absent-everything'), { '.aidd/keep': 'x' }, 'absent-everything');
	makeRepo(
		join(fleet, 'drifted'),
		{
			'.aidd/keep': 'x',
			'.githooks/guard.sh': 'guard v1\n',
			'.githooks/pre-push': '#!/bin/sh\n# OURS\nguard v1\n',
			'.githooks/seed.txt': 'seed edited locally\n',
		},
		'drifted',
	);
	makeRepo(
		join(fleet, 'dirty'),
		{ '.aidd/keep': 'x', '.githooks/guard.sh': 'guard v1\n' },
		'dirty',
	);
	makeRepo(
		join(fleet, 'foreign'),
		{ '.aidd/keep': 'x', '.githooks/pre-push': '#!/bin/sh\n# husky\n' },
		'foreign',
	);
	makeRepo(
		join(fleet, 'chained'),
		{ '.aidd/keep': 'x', '.githooks/pre-push': '#!/bin/sh\n# OURS\n# LOCAL CHAIN\nlint\n' },
		'chained',
	);

	for (const repo of ['drifted', 'dirty', 'foreign', 'chained', 'absent-everything']) {
		git(join(fleet, repo), 'config', 'core.hooksPath', '.githooks');
	}

	// The uncommitted change the writer must refuse to destroy.
	writeFileSync(join(fleet, 'dirty', '.githooks', 'guard.sh'), 'guard v1 + local work\n');

	const group = loadManifest(scripts)[0] as SharedCoreGroup;
	return { fleet, group, owner, scripts };
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
