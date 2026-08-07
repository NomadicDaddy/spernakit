/**
 * The synthetic fleet the shared-core write self-test runs against.
 *
 * Split from the assertions because it is a different kind of thing: this file arranges states the
 * real fleet is not in and must never be put into — drift, uncommitted work, a foreign hook, a
 * hand-maintained chain, and a dispatcher that is not ours — so that the writer can be seen both
 * writing and refusing. On the real manifest it reports "0 file(s) would change", which is the
 * right state for the fleet and no evidence at all about the writer.
 *
 * The repositories are real `git init` repositories because several of the guards are answered by
 * git rather than by the filesystem. A mocked git would test the mock.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadManifest, type SharedCoreGroup } from '../shared-core/manifest.ts';

export interface Fixture {
	fleet: string;
	group: SharedCoreGroup;
	owner: string;
	scripts: string;
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
	// The hook names the guard it chains, which is what makes `guard.sh` conditional on a target's
	// dispatcher actually calling it. `seed.txt` is deliberately not named: a file the hook never
	// chains must stay unconditional, which is the real leak-guard-setup.sh case.
	'.githooks/pre-push': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\n',
	'.githooks/seed.txt': 'seed original\n',
};

export function build(): Fixture {
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

	// Two repositories whose dispatcher is not ours, differing only in what it chains. core.hooksPath
	// is deliberately left unset, so git runs .git/hooks — which is where a foreign dispatcher such
	// as simple-git-hooks writes, and is the real configuration of one repository in this fleet.
	//
	// Neither answer here is inferable from the manifest and neither blanket rule is right: the guard
	// must reach the repository that calls it and must never reach the one that does not, and only
	// the dispatcher can say which is which.
	for (const [repo, dispatcher] of [
		['reached', '#!/bin/sh\nbash .githooks/guard.sh\n'],
		['unreached', '#!/bin/sh\nbash .githooks/some-other-guard.sh\n'],
	] as const) {
		makeRepo(join(fleet, repo), { '.aidd/keep': 'x' }, repo);
		writeFileSync(join(fleet, repo, '.git', 'hooks', 'pre-push'), dispatcher);
	}

	// The uncommitted change the writer must refuse to destroy.
	writeFileSync(join(fleet, 'dirty', '.githooks', 'guard.sh'), 'guard v1 + local work\n');

	return { fleet, group: loadManifest(scripts)[0] as SharedCoreGroup, owner, scripts };
}
