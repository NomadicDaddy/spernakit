#!/usr/bin/env bun
/**
 * Gate: installing in an upgrade worktree never changes which hooks another checkout runs
 * (`.aidd/features/worktree-prepare-shared-hook-path`, option W).
 *
 * Against a throwaway repository whose main checkout dispatches from `.githooks` and a linked
 * worktree that carries the delivered `scripts/smokestack/hooks`:
 *  1. With `extensions.worktreeConfig` on, running scripts/set-hooks-path.ts (what `prepare` runs)
 *     in the worktree writes the worktree's own value. The main checkout keeps `.githooks`, and
 *     `git hook run pre-commit` in each checkout runs that checkout's own guard, before and after
 *     the install.
 *  2. hasSmokestackHooksPath (scripts/lib/template/hooks-path.ts) reads the value git dispatches
 *     from: true in the worktree, false in the main checkout.
 *  3. With the extension off, the script writes the shared value as before (`--local`), and never
 *     turns the extension on itself.
 */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { hasSmokestackHooksPath } from './lib/template/hooks-path.ts';

const repoRoot = resolve(import.meta.dir, '..');
const SET_HOOKS = join(repoRoot, 'scripts', 'set-hooks-path.ts');
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

function setHooks(cwd: string): void {
	const result = Bun.spawnSync(['bun', SET_HOOKS], { cwd, stderr: 'pipe', stdout: 'pipe' });
	assert(result.exitCode === 0, `set-hooks-path failed in ${cwd}: ${result.stderr.toString()}`);
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
	git(worktree, 'add', 'scripts');
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
	assert(guardRuns(main) === 'main-guard', '1: before the install, main must run its own guard');

	setHooks(worktree);
	assert(
		config(main, '--local', 'core.hooksPath') === '.githooks',
		'1: the install must leave main on .githooks',
	);
	assert(
		config(worktree, '--worktree', 'core.hooksPath') === 'scripts/smokestack/hooks',
		'1: the install must write the worktree its own value',
	);
	assert(
		guardRuns(main) === 'main-guard',
		`1: after the install, main must run its own guard, got "${guardRuns(main)}"`,
	);
	assert(
		guardRuns(worktree) === 'worktree-guard',
		`1: the worktree must run its own guard, got "${guardRuns(worktree)}"`,
	);

	assert(hasSmokestackHooksPath(worktree), '2: the worktree is on the delivered hooks');
	assert(!hasSmokestackHooksPath(main), '2: the main checkout is not');
}

function sharedScope(root: string): void {
	const main = join(root, 'plain');
	mkdirSync(main);
	repository(main);
	setHooks(main);
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
