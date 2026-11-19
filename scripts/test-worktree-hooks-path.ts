#!/usr/bin/env bun
/**
 * Gate: installing in an upgrade worktree never changes which hooks another checkout runs
 * (`.aidd/features/worktree-prepare-shared-hook-path`, option W).
 *
 * Against a throwaway repository whose main checkout dispatches from `.githooks` and a linked
 * worktree that carries the delivered `scripts/smokestack/hooks`:
 *  1. With `extensions.worktreeConfig` on, this checkout's real `prepare` script, run with
 *     `bun run prepare` in the worktree, writes the worktree's own value and leaves the main
 *     checkout on `.githooks`. `git hook run pre-commit` in each checkout runs that checkout's own
 *     guard before the install, after it, and after the upgrade branch merges into main.
 *  2. hasSmokestackHooksPath (scripts/lib/template/hooks-path.ts) reads the value git dispatches
 *     from: true in the worktree, false in the main checkout.
 *  3. With the extension off, `prepare` writes the shared value as before (`--local`), and never
 *     turns the extension on.
 * `prepare` runs end to end, the delivered Smokestack guard setup included, since it reads and
 * writes `core.hooksPath` too. It runs this checkout's delivery (0.10.12 or later); an older
 * delivery's setup writes the shared value, which is why the 3.50.4 upgrade note asks for 0.10.12
 * before upgrading in a worktree. Smokestack's lib/shared-core is not copied, so `prepare` is also
 * shown not to depend on its hooks-scope.ts.
 */
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { hasSmokestackHooksPath } from './lib/template/hooks-path.ts';

const repoRoot = resolve(import.meta.dir, '..');
const PREPARE_FILES = [
	'scripts/set-hooks-path.ts',
	'scripts/lib/template/git-hooks-scope.ts',
	'scripts/smokestack/run-bash.ts',
	'scripts/smokestack/hooks/leak-guard-setup.sh',
];
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function git(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], { stderr: 'pipe', stdout: 'pipe' });
	if (result.exitCode !== 0)
		throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
	return result.stdout.toString().trim();
}

function config(cwd: string, scope: '--local' | '--worktree', key: string): string {
	const result = Bun.spawnSync(['git', '-C', cwd, 'config', scope, '--get', key], {
		stdout: 'pipe',
	});
	return result.stdout.toString().trim();
}

/** A pre-commit hook that records which guard ran. */
function writeHook(dir: string, marker: string): void {
	mkdirSync(dir, { recursive: true });
	for (const name of ['pre-commit', 'pre-push']) {
		const file = join(dir, name);
		writeFileSync(
			file,
			`#!/bin/sh\necho ${marker} >> "$(git rev-parse --show-toplevel)/ran.txt"\n`,
		);
		chmodSync(file, 0o755);
	}
}

/** Which guards `git hook run pre-commit` ran in this checkout. */
function guardRuns(cwd: string): string {
	rmSync(join(cwd, 'ran.txt'), { force: true });
	Bun.spawnSync(['git', '-C', cwd, 'hook', 'run', 'pre-commit'], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return existsSync(join(cwd, 'ran.txt'))
		? readFileSync(join(cwd, 'ran.txt'), 'utf8').trim()
		: '';
}

/**
 * Give a checkout what this template's `prepare` runs: the real `prepare` script from this
 * checkout's package.json, the real hooks-path setter and its scope module, and the delivered
 * run-bash.ts and leak-guard-setup.sh. runPrepare points the setup at a patterns file that already
 * exists, so it only does its hooks-path step.
 */
function stagePrepare(dir: string): void {
	const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
		scripts: { prepare: string };
	};
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({ scripts: { prepare: pkg.scripts.prepare } }),
	);
	for (const file of PREPARE_FILES) {
		mkdirSync(dirname(join(dir, file)), { recursive: true });
		copyFileSync(join(repoRoot, file), join(dir, file));
	}
}

/** Run the checkout's `prepare` exactly as an install does. */
function runPrepare(cwd: string): void {
	const result = Bun.spawnSync(['bun', 'run', 'prepare'], {
		cwd,
		env: { ...process.env, LEAK_GUARD_PATTERNS: join(dirname(cwd), 'patterns') },
		stderr: 'pipe',
		stdout: 'pipe',
	});
	assert(result.exitCode === 0, `prepare failed in ${cwd}: ${result.stderr.toString()}`);
}

function repository(dir: string): void {
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'config', 'user.email', 'probe@example.test');
	git(dir, 'config', 'user.name', 'probe');
	writeHook(join(dir, '.githooks'), 'main-guard');
	writeFileSync(join(dir, '.gitignore'), 'ran.txt\n');
	git(dir, 'add', '.');
	git(dir, 'commit', '-q', '-m', 'base');
	git(dir, 'config', '--local', 'core.hooksPath', '.githooks');
}

/** A linked worktree on a branch that carries the delivered, executable Smokestack hooks. */
function upgradeWorktree(main: string, worktree: string): void {
	git(main, 'worktree', 'add', '-q', '-b', 'upgrade', worktree);
	writeHook(join(worktree, 'scripts', 'smokestack', 'hooks'), 'worktree-guard');
	stagePrepare(worktree);
	git(worktree, 'add', 'scripts', 'package.json');
	git(
		worktree,
		'update-index',
		'--chmod=+x',
		'scripts/smokestack/hooks/pre-commit',
		'scripts/smokestack/hooks/pre-push',
	);
	git(worktree, 'commit', '-q', '--no-verify', '-m', 'take smokestack hooks');
}

function worktreeScoped(root: string): void {
	const main = join(root, 'main');
	const worktree = join(root, 'upgrade');
	mkdirSync(main);
	repository(main);
	git(main, 'config', 'extensions.worktreeConfig', 'true');
	upgradeWorktree(main, worktree);
	bothGuards(main, worktree, 'before the install', 'main-guard');

	runPrepare(worktree);
	assert(
		config(main, '--local', 'core.hooksPath') === '.githooks',
		'1: the install must leave main on .githooks',
	);
	assert(
		config(worktree, '--worktree', 'core.hooksPath') === 'scripts/smokestack/hooks',
		'1: the install must write the worktree its own value',
	);
	bothGuards(main, worktree, 'after the install', 'worktree-guard');
	assert(hasSmokestackHooksPath(worktree), '2: the worktree is on the delivered hooks');
	assert(!hasSmokestackHooksPath(main), '2: the main checkout is not');

	git(main, 'merge', '-q', '--ff-only', 'upgrade');
	bothGuards(main, worktree, 'after the merge', 'worktree-guard');
}

/** Main runs its own .githooks guard, and the worktree the guard it should have at this stage. */
function bothGuards(main: string, worktree: string, stage: string, worktreeGuard: string): void {
	const mainRan = guardRuns(main);
	assert(mainRan === 'main-guard', `1: ${stage}, main must run its own guard, got "${mainRan}"`);
	const worktreeRan = guardRuns(worktree);
	assert(
		worktreeRan === worktreeGuard,
		`1: ${stage}, the worktree must run ${worktreeGuard}, got "${worktreeRan}"`,
	);
}

function sharedScope(root: string): void {
	const main = join(root, 'plain');
	mkdirSync(main);
	repository(main);
	stagePrepare(main);
	runPrepare(main);
	assert(
		config(main, '--local', 'core.hooksPath') === 'scripts/smokestack/hooks',
		'3: without the extension the shared value is written',
	);
	assert(
		config(main, '--local', 'extensions.worktreeConfig') === '',
		'3: the script must not turn the extension on',
	);
}

const root = mkdtempSync(join(tmpdir(), 'spernakit-worktree-hooks-'));
writeFileSync(join(root, 'patterns'), '# fixture: present, so the guard setup writes none\n');
try {
	worktreeScoped(root);
	sharedScope(root);
} finally {
	rmSync(root, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
}

if (failures.length > 0) {
	console.error(`worktree hooks path: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('worktree hooks path: all checks passed');
