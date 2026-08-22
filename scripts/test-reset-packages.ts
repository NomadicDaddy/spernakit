#!/usr/bin/env bun
/**
 * Regression coverage for reset-packages preserving dependencies when bun.lock is stale.
 *
 * The fixture first proves the successful preflight-cleanup-reinstall path. It then adds a
 * dependency without updating the generated lockfile and verifies the failing preflight leaves the
 * existing dependency tree untouched.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

interface RunResult {
	exitCode: number;
	output: string;
}

interface SmokeConfig {
	modes: Record<string, { steps: { command: string }[] }>;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function write(relativePath: string, content: string): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

function run(args: string[]): RunResult {
	const result = Bun.spawnSync(args, {
		cwd: fixtureRoot,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function occurrences(value: string, search: string): number {
	return value.split(search).length - 1;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'reset-packages-'));
const dependencySentinel = join(fixtureRoot, 'node_modules', 'preserved.txt');
const cleanupSentinel = join(fixtureRoot, 'dist', 'preserved.txt');

try {
	write(
		'package.json',
		`${JSON.stringify(
			{
				name: 'reset-packages-fixture',
				private: true,
				workspaces: ['packages/*'],
			},
			null,
			'\t',
		)}\n`,
	);
	write(
		'packages/fixture-workspace/package.json',
		`${JSON.stringify(
			{
				name: 'fixture-workspace',
				private: true,
				version: '1.0.0',
			},
			null,
			'\t',
		)}\n`,
	);
	mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
	copyFileSync(
		join(repoRoot, 'scripts', 'reset-packages.ts'),
		join(fixtureRoot, 'scripts', 'reset-packages.ts'),
	);

	const install = run(['bun', 'install']);
	assert(install.exitCode === 0, `Fixture install must succeed:\n${install.output}`);
	assert(
		readFileSync(join(fixtureRoot, 'bun.lock'), 'utf8').includes('fixture-workspace'),
		'Fixture lockfile must name the workspace that will be removed',
	);

	write('node_modules/removed.txt', 'successful reset sentinel\n');
	const success = run(['bun', 'scripts/reset-packages.ts']);
	assert(success.exitCode === 0, `Valid package reset must succeed:\n${success.output}`);
	assert(
		success.output.includes('Frozen install preflight passed.') &&
			success.output.includes('Package reset complete!'),
		`Successful reset must preflight before completing:\n${success.output}`,
	);
	assert(
		!existsSync(join(fixtureRoot, 'node_modules', 'removed.txt')),
		'Successful reset must remove the old dependency sentinel before reinstalling',
	);
	const smoke = (await Bun.file(join(repoRoot, 'scripts', 'smoke.json')).json()) as SmokeConfig;
	const resetCommands = smoke.modes['reset']?.steps.map((step) => step.command);
	assert(
		JSON.stringify(resetCommands) ===
			JSON.stringify([
				'bun run stop',
				'bun scripts/clear-logs.ts',
				'bun scripts/reset-database.ts --force',
				'bun run reset-packages',
				'bun run --cwd backend db:migrate && bun run --cwd backend db:seed',
				'bun run smoke:qc',
				'bun run docker:build && bun run docker:image:build',
			]),
		`smoke:reset must retain its current sequence around reset-packages:\n${JSON.stringify(resetCommands)}`,
	);

	write(
		'package.json',
		`${JSON.stringify(
			{
				dependencies: { 'is-number': '7.0.0' },
				name: 'reset-packages-fixture',
				private: true,
				workspaces: ['packages/*'],
			},
			null,
			'\t',
		)}\n`,
	);
	write('node_modules/preserved.txt', 'dependency sentinel\n');
	write('dist/preserved.txt', 'cleanup sentinel\n');
	const failure = run(['bun', 'scripts/reset-packages.ts']);

	assert(failure.exitCode !== 0, `Stale lockfile must fail:\n${failure.output}`);
	assert(
		occurrences(failure.output, 'Package reset preflight failed') === 1,
		`Stale lockfile must produce one named preflight error:\n${failure.output}`,
	);
	assert(failure.output.includes('bun.lock'), `Failure must name bun.lock:\n${failure.output}`);
	assert(
		failure.output.includes('Run `bun install`'),
		`Failure must state the recovery command:\n${failure.output}`,
	);
	assert(
		failure.output.includes('Existing dependency directories were preserved'),
		`Failure must state that dependencies were preserved:\n${failure.output}`,
	);
	assert(
		existsSync(dependencySentinel),
		'Failed preflight must preserve the node_modules sentinel',
	);
	assert(existsSync(cleanupSentinel), 'Failed preflight must not run later cleanup steps');
	assert(
		!failure.output.includes('Finding node_modules'),
		`Failed preflight must abort before cleanup:\n${failure.output}`,
	);

	console.log(`Package reset preflight test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
