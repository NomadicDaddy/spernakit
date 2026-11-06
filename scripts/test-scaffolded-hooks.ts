#!/usr/bin/env bun
/**
 * Regression test for derived-app hooks, both chains.
 *
 * Drives the real initializer copy surface, tagged-template drift check, and Bash hooks against an
 * isolated fixture. This prevents an app's hook from chaining a guard that the initializer does not
 * copy, or from consuming the ref stream before every guard receives it.
 *
 * An app's hooks are smokestack's managed copies under scripts/smokestack/hooks, which the template
 * tree carries and the initializer copies like any other template file. Until 2026-11-06 apps got a
 * separate scaffolding/.githooks copy instead, which drifted from the delivered hooks; that copy is
 * gone, and no app is given .githooks/ (Phillip #37401). The reference scan is still derived from
 * the hook text rather than a hardcoded list, so a guard added to a hook without the file beside it
 * fails here, including guards that do not exist yet.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import { copyTemplateTree } from './lib/init/scaffold.ts';
import { assertCommitChain } from './lib/scaffolded-hooks/commit-chain.ts';
import {
	assert,
	assertionCount,
	commandLines,
	equalBytes,
	referencedGuards,
	resolveBash,
	run,
	type RunResult,
	write,
} from './lib/scaffolded-hooks/harness.ts';

const TEMPLATE_VERSION = '9.0.0';
const ZERO = '0'.repeat(40);
const HOOKS_DIR = 'scripts/smokestack/hooks';
const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'scaffolded-hooks-'));
const templateDir = join(fixtureRoot, 'template');
const appDir = join(fixtureRoot, 'app');
const bash = resolveBash();

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
	const hooksRoot = join(repoRoot, HOOKS_DIR);
	const hookNames = readdirSync(hooksRoot, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();
	const hook = (name: string): Buffer => readFileSync(join(hooksRoot, name));

	const prePushText = commandLines(hook('pre-push').toString('utf8'));
	const preCommitText = commandLines(hook('pre-commit').toString('utf8'));
	assert(
		prePushText.indexOf('aidd history guard') < prePushText.indexOf('screenshot guard'),
		'The pre-push hook must run the history guard before the screenshot guard.',
	);
	// The leak guard scans the staged index and is uncacheable-by-design, so it runs first: a commit
	// carrying a secret must be rejected before any cached qc step can let it through.
	assert(
		preCommitText.indexOf('leak-guard.sh') < preCommitText.indexOf('smoke:qc:fast'),
		'The pre-commit hook must run the leak guard before the cached qc subset.',
	);
	// Both hooks are copied into an app together, so the guards they chain must be enumerable from
	// the hook text alone — a guard added without its file beside the hook fails here.
	const chained = [...referencedGuards(prePushText), ...referencedGuards(preCommitText)];
	assert(
		chained.includes('leak-guard.sh'),
		`The pre-commit hook must chain the leak guard; found ${chained.join(', ')}.`,
	);
	for (const guard of chained) {
		assert(hookNames.includes(guard), `The hooks chain ${guard}, which ${HOOKS_DIR} lacks.`);
	}

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
	// The three script names the pre-commit chains. The template defines them and the app inherits
	// them verbatim — `package.json` is branded, so only name/description/version may differ, which
	// is exactly what makes the contract survive branding.
	const contractScripts = {
		'check:leak-guard': "echo 'fixture check:leak-guard'",
		'check:licenses': "echo 'fixture check:licenses'",
		'smoke:qc:fast': "echo 'fixture smoke:qc:fast'",
	};
	const templatePackage = `${JSON.stringify(
		{
			description: 'Fixture template',
			name: 'spernakit',
			scripts: contractScripts,
			version: TEMPLATE_VERSION,
		},
		null,
		'\t',
	)}\n`;
	const appPackage = `${JSON.stringify(
		{
			description: 'Fixture app',
			name: 'fixture-app',
			scripts: contractScripts,
			spernakit_version: TEMPLATE_VERSION,
			version: '1.0.0',
		},
		null,
		'\t',
	)}\n`;

	mkdirSync(templateDir, { recursive: true });
	assertGit('init', '-b', 'main');
	// A derived app captures for the same reason the template does, so the declaration ships from
	// the root and the copier maps it to the app root unchanged. Without it the scaffolded app is
	// opted out and the screenshot assertion below stops asserting anything.
	write(templateDir, '.screenshot-capture', readFileSync(join(repoRoot, '.screenshot-capture')));
	for (const name of hookNames) write(templateDir, `${HOOKS_DIR}/${name}`, hook(name));
	write(templateDir, 'package.json', templatePackage);
	write(templateDir, 'scripts/template-manifest.json', manifest);
	assertGit('add', '-A');
	assertGit('commit', '-m', `v${TEMPLATE_VERSION}`);
	assertGit('tag', `v${TEMPLATE_VERSION}`);

	const copied = copyTemplateTree(templateDir, appDir);
	const expected = hookNames.length + 3;
	assert(copied === expected, `Expected ${expected} app-facing files, copied ${copied}.`);
	assert(
		existsSync(join(appDir, '.screenshot-capture')),
		'The initializer must copy .screenshot-capture, or every scaffolded app is born opted out.',
	);
	assert(
		!existsSync(join(appDir, '.githooks')),
		'The initializer must not give an app the old .githooks/ layout.',
	);
	const taggedHook = assertGit('show', `v${TEMPLATE_VERSION}:${HOOKS_DIR}/pre-push`).stdout;
	assert(
		equalBytes(readFileSync(join(appDir, HOOKS_DIR, 'pre-push')), taggedHook),
		'The freshly scaffolded hook must byte-match the tagged template copy.',
	);
	// The regression the leak guard once hit: a hook that reached the app without the guard it
	// chains. Assert against the copied tree, not the template source.
	for (const guard of chained) {
		assert(
			equalBytes(readFileSync(join(appDir, HOOKS_DIR, guard)), hook(guard)),
			`The initializer must copy ${guard} unchanged beside the hook that chains it.`,
		);
	}

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

	assertCommitChain(appDir, bash);
	assert(
		run(['git', 'add', '.screenshot-capture'], appDir).exitCode === 0,
		'Fixture capture declaration staging failed.',
	);
	const captureCommit = run(
		[
			'git',
			'-c',
			'user.email=fixture@example.com',
			'-c',
			'user.name=Fixture',
			'commit',
			'-m',
			'Declare release capture',
		],
		appDir,
	);
	assert(captureCommit.exitCode === 0, `Fixture capture commit failed:\n${captureCommit.output}`);
	const candidate = run(['git', 'rev-parse', 'HEAD'], appDir).output.trim();

	const screenshotPath = `screenshots/v${TEMPLATE_VERSION}/unreviewed.png`;
	write(appDir, screenshotPath, 'fixture');
	const staged = run(['git', 'add', screenshotPath], appDir);
	assert(staged.exitCode === 0, `Fixture screenshot staging failed:\n${staged.output}`);
	const refLine = `refs/tags/v1.0.0 ${candidate} refs/tags/v1.0.0 ${ZERO}\n`;
	const push = run([bash, `${HOOKS_DIR}/pre-push`, 'origin', 'fixture'], appDir, refLine);
	assert(
		push.exitCode !== 0,
		`An incomplete screenshot capture must block push:\n${push.output}`,
	);
	assert(
		push.output.includes('pre-push: screenshot guard') &&
			push.output.includes('Expected one version directory') &&
			push.output.includes('PUSH BLOCKED'),
		`The scaffolded hook must reach the screenshot guard failure:\n${push.output}`,
	);

	console.log(`Scaffolded hook test passed (${assertionCount()} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
