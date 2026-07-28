#!/usr/bin/env bun
/**
 * Regression test for derived-app pre-push hook scaffolding.
 *
 * Drives the real initializer copy surface, tagged-template drift check, and Bash hook against an
 * isolated fixture. This prevents the scaffold hook from chaining a guard that the initializer
 * does not copy, or from consuming the ref stream before every guard receives it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

import { copyTemplateTree } from './lib/init/scaffold.ts';

interface RunResult {
	exitCode: number;
	output: string;
	stdout: Uint8Array;
}

const TEMPLATE_VERSION = '9.0.0';
const ZERO = '0'.repeat(40);
const LOCAL_SHA = '1'.repeat(40);
const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'scaffolded-hooks-'));
const templateDir = join(fixtureRoot, 'template');
const appDir = join(fixtureRoot, 'app');
let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function write(root: string, relativePath: string, content: string | Uint8Array): void {
	const target = join(root, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function run(
	command: string[],
	cwd: string,
	stdin?: string,
	env?: Record<string, string>,
): RunResult {
	const base = {
		cwd,
		stderr: 'pipe',
		stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
		stdout: 'pipe',
	} as const;
	const result = Bun.spawnSync(
		command,
		env === undefined ? base : { ...base, env: { ...process.env, ...env } },
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
		stdout: result.stdout,
	};
}

function git(...args: string[]): RunResult {
	return run(
		[
			'git',
			'-C',
			templateDir,
			'-c',
			'user.email=fixture@example.com',
			'-c',
			'user.name=Fixture',
			...args,
		],
		templateDir,
	);
}

function assertGit(...args: string[]): RunResult {
	const result = git(...args);
	assert(result.exitCode === 0, `git ${args.join(' ')} failed:\n${result.output}`);
	return result;
}

try {
	const rootHook = readFileSync(join(repoRoot, '.githooks', 'pre-push'));
	const scaffoldHook = readFileSync(join(repoRoot, 'scaffolding', '.githooks', 'pre-push'));
	const rootScreenshotGuard = readFileSync(join(repoRoot, '.githooks', 'screenshot-guard.sh'));
	const scaffoldScreenshotGuard = readFileSync(
		join(repoRoot, 'scaffolding', '.githooks', 'screenshot-guard.sh'),
	);
	const scaffoldHistoryGuard = readFileSync(
		join(repoRoot, 'scaffolding', '.githooks', 'aidd-history-guard.sh'),
	);

	assert(
		equalBytes(rootHook, scaffoldHook),
		'The scaffold pre-push hook must byte-match the root two-guard wiring.',
	);
	assert(
		equalBytes(rootScreenshotGuard, scaffoldScreenshotGuard),
		'The scaffold screenshot guard must byte-match the root guard.',
	);
	const hookText = scaffoldHook.toString('utf8');
	assert(
		hookText.indexOf('aidd history guard') < hookText.indexOf('screenshot guard'),
		'The scaffold hook must run the history guard before the screenshot guard.',
	);

	const manifest = `${JSON.stringify(
		{
			$comment: 'Scaffolded hook fixture',
			branded: ['package.json'],
			buildCriticalBranded: [],
			infrastructure: [],
		},
		null,
		'\t',
	)}\n`;
	const templatePackage = `${JSON.stringify(
		{
			description: 'Fixture template',
			name: 'spernakit',
			version: TEMPLATE_VERSION,
		},
		null,
		'\t',
	)}\n`;
	const appPackage = `${JSON.stringify(
		{
			description: 'Fixture app',
			name: 'fixture-app',
			spernakit_version: TEMPLATE_VERSION,
			version: '1.0.0',
		},
		null,
		'\t',
	)}\n`;

	mkdirSync(templateDir, { recursive: true });
	assertGit('init', '-b', 'main');
	write(templateDir, '.githooks/pre-push', rootHook);
	write(templateDir, '.githooks/screenshot-guard.sh', rootScreenshotGuard);
	write(templateDir, 'package.json', templatePackage);
	write(templateDir, 'scaffolding/.githooks/aidd-history-guard.sh', scaffoldHistoryGuard);
	write(templateDir, 'scaffolding/.githooks/pre-push', scaffoldHook);
	write(templateDir, 'scaffolding/.githooks/screenshot-guard.sh', scaffoldScreenshotGuard);
	write(templateDir, 'scripts/template-manifest.json', manifest);
	assertGit('add', '-A');
	assertGit('commit', '-m', `v${TEMPLATE_VERSION}`);
	assertGit('tag', `v${TEMPLATE_VERSION}`);

	const copied = copyTemplateTree(templateDir, appDir);
	assert(copied === 5, `Expected five app-facing files, copied ${copied}.`);
	const taggedHook = assertGit(
		'show',
		`v${TEMPLATE_VERSION}:scaffolding/.githooks/pre-push`,
	).stdout;
	const appHook = readFileSync(join(appDir, '.githooks', 'pre-push'));
	assert(
		equalBytes(appHook, taggedHook),
		'The freshly scaffolded hook must byte-match the tagged scaffold baseline.',
	);
	assert(
		equalBytes(
			readFileSync(join(appDir, '.githooks', 'screenshot-guard.sh')),
			scaffoldScreenshotGuard,
		),
		'The initializer must copy the screenshot guard beside the hook that invokes it.',
	);

	write(appDir, 'package.json', appPackage);
	write(
		appDir,
		'config/fixture-app.json',
		`${JSON.stringify({
			app: { description: 'Fixture app', name: 'Fixture App', slug: 'fixture-app' },
			server: { backendPort: 3331, frontendPort: 3330 },
		})}\n`,
	);
	const drift = run(
		['bun', join(repoRoot, 'scripts', 'check-template-drift.ts'), '--template', templateDir],
		appDir,
		undefined,
		{ APP_SLUG: 'fixture-app' },
	);
	assert(drift.exitCode === 0, `Fresh scaffold hook drift must be clean:\n${drift.output}`);
	assert(
		drift.output.includes('No template drift detected'),
		`The real drift report must confirm the clean scaffold:\n${drift.output}`,
	);

	const appGit = run(['git', 'init', '-b', 'main'], appDir);
	assert(appGit.exitCode === 0, `Fixture app git init failed:\n${appGit.output}`);
	const screenshotPath = `screenshots/v${TEMPLATE_VERSION}/unreviewed.png`;
	write(appDir, screenshotPath, 'fixture');
	const staged = run(['git', 'add', screenshotPath], appDir);
	assert(staged.exitCode === 0, `Fixture screenshot staging failed:\n${staged.output}`);
	const refLine =
		`refs/tags/v${TEMPLATE_VERSION} ${LOCAL_SHA} ` + `refs/tags/v${TEMPLATE_VERSION} ${ZERO}\n`;
	const hook = run(['bash', '.githooks/pre-push', 'origin', 'fixture'], appDir, refLine);
	assert(
		hook.exitCode !== 0,
		`An incomplete screenshot capture must block push:\n${hook.output}`,
	);
	assert(
		hook.output.includes('pre-push: screenshot guard') &&
			hook.output.includes('has only 1 PNG(s)') &&
			hook.output.includes('PUSH BLOCKED'),
		`The scaffolded hook must reach the screenshot guard failure:\n${hook.output}`,
	);

	console.log(`Scaffolded pre-push hook test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
