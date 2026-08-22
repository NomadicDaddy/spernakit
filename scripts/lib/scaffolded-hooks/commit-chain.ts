/**
 * End-to-end commit-time case: drive the scaffolded `pre-commit` in the fixture app and prove the
 * leak guard both blocks a staged secret and lets a clean commit through.
 *
 * The negative control is the load-bearing half. A guard that is missing, misconfigured, or
 * unconditionally failing all produce the same "blocked" result on the leaky input; only a clean
 * commit reaching `pre-commit: passed` shows the hook is discriminating.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { assert, run, write } from './harness.ts';

/** Runs the scaffolded pre-commit against a leaky and a clean staged change, in that order. */
export function assertCommitChain(appDir: string, bash: string): void {
	// The leak guard diffs the index against HEAD, so the fixture needs one commit to diff against.
	// No hooks fire here: the fixture app never sets core.hooksPath, which is also why nothing in
	// this suite needs --no-verify.
	assert(
		run(['git', 'add', 'package.json'], appDir).exitCode === 0,
		'Fixture app baseline staging failed.',
	);
	const baseline = run(
		[
			'git',
			'-c',
			'user.email=fixture@example.com',
			'-c',
			'user.name=Fixture',
			'commit',
			'-m',
			'baseline',
		],
		appDir,
	);
	assert(baseline.exitCode === 0, `Fixture app baseline commit failed:\n${baseline.output}`);

	// Tier 2 of the leak guard reads private literals from a file outside the repo by design. Point
	// it at an empty file inside the fixture so this asserts the tracked tier-1 rules alone and does
	// not depend on what the developer running the suite happens to have seeded locally.
	write(appDir, 'leak-guard-patterns', '');
	const leakEnv = { LEAK_GUARD_PATTERNS: join(appDir, 'leak-guard-patterns') };

	// Assembled at runtime. Writing the literal would put a string this repository's own leak guard
	// rejects into a tracked file, and the guard would then block every commit that touches it.
	const syntheticKey = `AKIA${'A'.repeat(16)}`;
	write(appDir, 'src/leaky.ts', `export const token = '${syntheticKey}';\n`);
	const stagedLeak = run(['git', 'add', 'src/leaky.ts'], appDir);
	assert(stagedLeak.exitCode === 0, `Fixture secret staging failed:\n${stagedLeak.output}`);
	const blocked = run([bash, '.githooks/pre-commit'], appDir, undefined, leakEnv);
	assert(blocked.exitCode !== 0, `A staged secret must block the commit:\n${blocked.output}`);
	assert(
		blocked.output.includes('pre-commit: leak-guard') &&
			blocked.output.includes('forbidden private/secret patterns'),
		`The scaffolded pre-commit must fail at the leak guard:\n${blocked.output}`,
	);
	// The guard scans the staged index and cannot be cached, so it has to run before the cached qc
	// subset — a cache hit must never be able to wave a secret through.
	assert(
		!blocked.output.includes('pre-commit: qc'),
		`The leak guard must block before the qc subset runs:\n${blocked.output}`,
	);
	assert(
		run(['git', 'rm', '--cached', '-f', 'src/leaky.ts'], appDir).exitCode === 0,
		'Unstaging the fixture secret failed.',
	);
	rmSync(join(appDir, 'src', 'leaky.ts'), { force: true });

	// Negative control: the same hook must run the script-name contract through to completion.
	write(appDir, 'src/clean.ts', 'export const token = process.env.API_TOKEN;\n');
	const stagedClean = run(['git', 'add', 'src/clean.ts'], appDir);
	assert(stagedClean.exitCode === 0, `Fixture clean staging failed:\n${stagedClean.output}`);
	const allowed = run([bash, '.githooks/pre-commit'], appDir, undefined, leakEnv);
	assert(
		allowed.exitCode === 0,
		`A clean commit must pass the scaffolded hook:\n${allowed.output}`,
	);
	assert(
		allowed.output.includes('pre-commit: qc') && allowed.output.includes('pre-commit: passed'),
		`The clean path must reach the qc subset and pass:\n${allowed.output}`,
	);
	assert(
		run(['git', 'rm', '--cached', '-f', 'src/clean.ts'], appDir).exitCode === 0,
		'Unstaging the fixture clean file failed.',
	);
}
