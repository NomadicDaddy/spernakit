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
function makeRepo(
	root: string,
	files: Record<string, string>,
	name?: string,
	scripts: Record<string, string> = {},
): string {
	mkdirSync(root, { recursive: true });
	if (name !== undefined) {
		write(join(root, 'package.json'), JSON.stringify({ name, scripts }));
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
				// Two variants, mirroring the real leak-guard-hooks group. Without them a differing
				// hook has exactly one possible reading and `drift` on a hook is unreachable: any
				// body that carries the marker and matches the single variant's opposite is
				// `diverged-hook`. The pair is what separates "holds the OTHER variant, upgrade it"
				// from "matches neither, only a person can say why".
				{
					disposition: 'synced',
					fallbackSource: 'pre-push-minimal',
					requiresScripts: ['qc'],
					source: 'pre-push',
				},
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
	'.githooks/pre-push': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\nqc\n',
	// The lesser variant for targets that cannot satisfy the script contract. It chains the same
	// guard, which is the invariant the two variants exist to preserve: the security tier is
	// identical and only the static checks are absent.
	'.githooks/pre-push-minimal': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\n',
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
	// Defines `qc`, so the full variant is the one it should hold, and it holds the minimal one
	// instead. That is drift the writer must fix: a target whose package.json now satisfies the
	// script contract it did not before is exactly what requiresScripts exists to move upward.
	makeRepo(
		join(fleet, 'drifted'),
		{
			'.aidd/keep': 'x',
			'.githooks/guard.sh': 'guard v1\n',
			'.githooks/pre-push': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\n',
			'.githooks/seed.txt': 'seed edited locally\n',
		},
		'drifted',
		{ qc: 'echo qc' },
	);

	// Ours by marker, matching NEITHER variant, and never declared a local chain. Content cannot
	// say whether someone's commit-time checks live in those extra lines or whether this is a copy
	// of ours from two generations ago, so the gate must fail and the writer must not act.
	makeRepo(
		join(fleet, 'diverged'),
		{
			'.aidd/keep': 'x',
			'.githooks/guard.sh': 'guard v2\n',
			'.githooks/pre-push': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\nlint\n',
			'.githooks/seed.txt': 'seed original\n',
		},
		'diverged',
	);
	makeRepo(
		join(fleet, 'dirty'),
		{ '.aidd/keep': 'x', '.githooks/guard.sh': 'guard v1\n' },
		'dirty',
	);
	makeRepo(
		join(fleet, 'staged'),
		{ '.aidd/keep': 'x', '.githooks/guard.sh': 'guard v1\n' },
		'staged',
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

	// Carries every synced file and does NOT carry the marker: seeded before the marker described
	// it, which is the state that left two repositories two weeks behind on one guard while the
	// group reported current (punchlist C1). Discovery must find it anyway, or every later fix to
	// a file it already holds routes around it silently.
	makeRepo(
		join(fleet, 'unmarked-carrier'),
		{
			'.githooks/guard.sh': 'guard v1\n',
			'.githooks/pre-push': '#!/bin/sh\n# OURS\nbash .githooks/guard.sh\nqc\n',
		},
		'unmarked-carrier',
		{ qc: 'echo qc' },
	);

	// The negative control, and the reason the rule is "carries every synced file" rather than any
	// of them: no marker and a partial holding. Discovery must NOT find it, or the rule becomes a
	// second way to adopt a repository nobody chose, and `uncovered` starts appearing for
	// repositories the group was never meant to reach.
	makeRepo(
		join(fleet, 'unmarked-stranger'),
		{ '.githooks/guard.sh': 'guard v1\n' },
		'unmarked-stranger',
	);

	// Declines, and may: no push remote, so nothing it holds can be published. The state `common` was
	// in for two days while every discovered group classified it `uncovered` and `--write` kept
	// offering to install into it (punchlist S14). It carries stale files too, so a decline that was
	// merely dropped from discovery rather than honored would still show up as drift.
	makeRepo(
		join(fleet, 'declines'),
		{
			'.aidd/keep': 'x',
			'.githooks/guard.sh': 'guard v1\n',
			'.no-fleet-sync': '# why\nlocal-only, never pushed\n',
		},
		'declines',
	);

	// The negative control, and the whole reason the declaration is conditional. A repository that
	// can publish cannot exempt itself from a guard that exists because selective installation leaked
	// a token. The file is identical; only the remote differs, and that is what decides.
	makeRepo(
		join(fleet, 'declines-but-publishes'),
		{
			'.aidd/keep': 'x',
			'.githooks/guard.sh': 'guard v1\n',
			'.no-fleet-sync': 'local-only, never pushed\n',
		},
		'declines-but-publishes',
	);
	git(join(fleet, 'declines-but-publishes'), 'remote', 'add', 'origin', join(fleet, 'aidd'));

	for (const repo of [
		'drifted',
		'diverged',
		'dirty',
		'staged',
		'foreign',
		'chained',
		'absent-everything',
		'unmarked-carrier',
		'declines',
		'declines-but-publishes',
	]) {
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

	// The uncommitted changes the writer must refuse to destroy, in both of the states git calls
	// uncommitted. `git status --porcelain` reports the index column and the worktree column, and a
	// guard that read only one of them would destroy work the other was holding.
	writeFileSync(join(fleet, 'dirty', '.githooks', 'guard.sh'), 'guard v1 + local work\n');
	writeFileSync(join(fleet, 'staged', '.githooks', 'guard.sh'), 'guard v1 + staged work\n');
	git(join(fleet, 'staged'), 'add', '.githooks/guard.sh');

	return { fleet, group: loadManifest(scripts)[0] as SharedCoreGroup, owner, scripts };
}
