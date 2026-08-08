#!/usr/bin/env bun
/**
 * Regression test for derived-app hook scaffolding, both chains.
 *
 * Drives the real initializer copy surface, tagged-template drift check, and Bash hooks against an
 * isolated fixture. This prevents a scaffold hook from chaining a guard that the initializer does
 * not copy, or from consuming the ref stream before every guard receives it.
 *
 * The commit-time half exists because that failure already happened: the leak guard shipped to the
 * template but never to `scaffolding/.githooks/`, so every app scaffolded after it landed got a
 * pre-commit hook with no leak guard beside it and nothing noticed. The reference scan is
 * deliberately derived from the hook text rather than a hardcoded list — a guard added to a hook
 * without a matching scaffold copy must fail here, including guards that do not exist yet.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
	run,
	type RunResult,
	write,
} from './lib/scaffolded-hooks/harness.ts';

const TEMPLATE_VERSION = '9.0.0';
const ZERO = '0'.repeat(40);
const LOCAL_SHA = '1'.repeat(40);
const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'scaffolded-hooks-'));
const templateDir = join(fixtureRoot, 'template');
const appDir = join(fixtureRoot, 'app');

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

/** Reads a hook or guard from both the repo root and `scaffolding/`, which must never diverge. */
function readPair(name: string) {
	return {
		root: readFileSync(join(repoRoot, '.githooks', name)),
		scaffold: readFileSync(join(repoRoot, 'scaffolding', '.githooks', name)),
	};
}

try {
	const prePush = readPair('pre-push');
	const screenshotGuard = readPair('screenshot-guard.sh');
	const preCommit = readPair('pre-commit');
	const leakGuard = readPair('leak-guard.sh');
	const leakGuardSetup = readPair('leak-guard-setup.sh');
	const scaffoldHistoryGuard = readFileSync(
		join(repoRoot, 'scaffolding', '.githooks', 'aidd-history-guard.sh'),
	);

	for (const [name, pair] of [
		['pre-push hook', prePush],
		['screenshot guard', screenshotGuard],
		['pre-commit hook', preCommit],
		['leak guard', leakGuard],
		['leak-guard setup', leakGuardSetup],
	] as const) {
		assert(
			equalBytes(pair.root, pair.scaffold),
			`The scaffold ${name} must byte-match the root copy.`,
		);
	}

	const prePushText = commandLines(prePush.scaffold.toString('utf8'));
	const preCommitText = commandLines(preCommit.scaffold.toString('utf8'));
	assert(
		prePushText.indexOf('aidd history guard') < prePushText.indexOf('screenshot guard'),
		'The scaffold hook must run the history guard before the screenshot guard.',
	);
	// The leak guard scans the staged index and is uncacheable-by-design, so it runs first: a commit
	// carrying a secret must be rejected before any cached qc step can let it through.
	assert(
		preCommitText.indexOf('leak-guard.sh') < preCommitText.indexOf('smoke:qc:fast'),
		'The scaffold pre-commit must run the leak guard before the cached qc subset.',
	);
	// Both scaffold hooks are copied into an app together, so the guards they chain must be
	// enumerable from the hook text alone — a guard added without a scaffold copy fails here.
	const chained = [...referencedGuards(prePushText), ...referencedGuards(preCommitText)];
	assert(
		chained.includes('leak-guard.sh'),
		`The scaffold pre-commit must chain the leak guard; found ${chained.join(', ')}.`,
	);
	for (const guard of chained) {
		assert(
			existsSync(join(repoRoot, 'scaffolding', '.githooks', guard)),
			`The scaffold hooks chain ${guard}, which scaffolding/.githooks/ does not carry.`,
		);
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
	// The three script names the scaffolded pre-commit chains. The template defines them and the app
	// inherits them verbatim — `package.json` is branded, so only name/description/version may
	// differ, which is exactly what makes the contract survive branding.
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
	// Not under scaffolding/: a derived app captures for the same reason the template does, so the
	// declaration ships from the root and the copier maps it to the app root unchanged. Without it
	// the scaffolded app is opted out and the screenshot assertion below stops asserting anything.
	write(templateDir, '.screenshot-capture', readFileSync(join(repoRoot, '.screenshot-capture')));
	write(templateDir, '.githooks/leak-guard-setup.sh', leakGuardSetup.root);
	write(templateDir, '.githooks/leak-guard.sh', leakGuard.root);
	write(templateDir, '.githooks/pre-commit', preCommit.root);
	write(templateDir, '.githooks/pre-push', prePush.root);
	write(templateDir, '.githooks/screenshot-guard.sh', screenshotGuard.root);
	write(templateDir, 'package.json', templatePackage);
	write(templateDir, 'scaffolding/.githooks/aidd-history-guard.sh', scaffoldHistoryGuard);
	write(templateDir, 'scaffolding/.githooks/leak-guard-setup.sh', leakGuardSetup.scaffold);
	write(templateDir, 'scaffolding/.githooks/leak-guard.sh', leakGuard.scaffold);
	write(templateDir, 'scaffolding/.githooks/pre-commit', preCommit.scaffold);
	write(templateDir, 'scaffolding/.githooks/pre-push', prePush.scaffold);
	write(templateDir, 'scaffolding/.githooks/screenshot-guard.sh', screenshotGuard.scaffold);
	write(templateDir, 'scripts/template-manifest.json', manifest);
	assertGit('add', '-A');
	assertGit('commit', '-m', `v${TEMPLATE_VERSION}`);
	assertGit('tag', `v${TEMPLATE_VERSION}`);

	const copied = copyTemplateTree(templateDir, appDir);
	assert(copied === 9, `Expected nine app-facing files, copied ${copied}.`);
	assert(
		existsSync(join(appDir, '.screenshot-capture')),
		'The initializer must copy .screenshot-capture, or every scaffolded app is born opted out.',
	);
	const taggedHook = assertGit(
		'show',
		`v${TEMPLATE_VERSION}:scaffolding/.githooks/pre-push`,
	).stdout;
	assert(
		equalBytes(readFileSync(join(appDir, '.githooks', 'pre-push')), taggedHook),
		'The freshly scaffolded hook must byte-match the tagged scaffold baseline.',
	);
	// This is the regression the leak guard actually hit: it lived in the template's own .githooks/
	// but never in scaffolding/, so every app scaffolded after it landed got a pre-commit hook with
	// no guard beside it. Assert against the copied tree, not the scaffold source.
	for (const guard of chained) {
		assert(
			existsSync(join(appDir, '.githooks', guard)),
			`The initializer must copy ${guard}, which a scaffolded hook chains.`,
		);
	}
	for (const [name, expected] of [
		['screenshot-guard.sh', screenshotGuard.scaffold],
		['leak-guard.sh', leakGuard.scaffold],
		['leak-guard-setup.sh', leakGuardSetup.scaffold],
	] as const) {
		assert(
			equalBytes(readFileSync(join(appDir, '.githooks', name)), expected),
			`The initializer must copy ${name} unchanged beside the hook that needs it.`,
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

	assertCommitChain(appDir);

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

	console.log(`Scaffolded hook test passed (${assertionCount()} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
