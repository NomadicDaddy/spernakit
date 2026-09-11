#!/usr/bin/env bun
/**
 * Fail when a derived app's `scripts/smoke.json` is missing steps the template declares.
 *
 * Enforces: ASSERT-052 -- a derived app's `scripts/smoke.json` carries every command the template
 * declares at that app's own `spernakit_version`, and every step it declares is wired to a
 * `package.json` script.
 *
 * An app that overrides `scripts/smoke.json` keeps its own copy of the runbook, and a
 * `.templateoverrides` entry suppresses drift detection for that path outright, so the template's
 * later additions to the same file become invisible. Nothing else compared the two. A release that
 * adds qc steps propagates the test scripts and their cache entries on its own, because neither is
 * overridden, while the steps that would run them are never merged: the app then runs a short gate
 * and reports green. The one existing throw in this area, `scripts/smoke-cache.ts:97`, covers the
 * reverse direction -- a step in the runbook with no cache entry. A step simply absent from the
 * runbook never runs and nothing complains.
 *
 * Three things follow from that and shape this gate:
 *
 * `.templateoverrides` is not read at all. An override on `scripts/smoke.json` is exactly what hides
 * the shortfall, so KEEP and SKIP cannot suppress this comparison, for that path or for
 * `scripts/smoke.md` and `package.json`, the other two files a runbook merge touches.
 *
 * The template side is read with `git show v{version}:scripts/smoke.json` at the app's OWN declared
 * version, never from the template checkout's working tree. Between a template release and the dance
 * that upgrades an app, the tip legitimately carries steps the app is not expected to have yet, and
 * that is where the whole fleet sits for most of a release cycle.
 *
 * The comparison runs in one direction. An app command the template does not have is counted and
 * ignored; only a template command the app lacks is a finding.
 *
 * Preconditions that cannot be met are labeled `[SKIP]` lines and exit 0, matching `check:drift`:
 * no `spernakit_version`, no template repository, no such tag. `DRIFT_REQUIRED=1` turns a skip into
 * a failure, so a dance run cannot pass on a template it could not read.
 *
 * Usage:
 *   bun scripts/check-smoke-steps.ts [--template /path/to/spernakit]
 *   DRIFT_REQUIRED=1 bun scripts/check-smoke-steps.ts   # skips become failures
 */
import path from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { compareSmokeSteps, parseSmokeFile } from './lib/smoke-steps/compare.ts';
import { printSmokeSteps } from './lib/smoke-steps/report.ts';
import {
	getTemplateFileAtVersion,
	gitTagExists,
	isSpernakitItself,
	readLocalFile,
	readSpernakitVersion,
	resolveSpernakitPath,
} from './lib/template/repo.ts';

const repoRoot = path.resolve(process.cwd());

const USAGE = 'Usage: check-smoke-steps [--template <dir>]';
const SMOKE = 'scripts/smoke.json';

export interface SmokeStepsOptions {
	root?: string | undefined;
	templatePath?: string | undefined;
}

export function parseSmokeStepArgs(args: string[]): SmokeStepsOptions {
	const { values } = parseArgs({
		args,
		options: { template: { type: 'string' } },
		strict: true,
	});
	const templatePath = values.template;
	if (templatePath !== undefined && (templatePath === '' || templatePath.startsWith('-'))) {
		throw new Error(`--template requires a directory. ${USAGE}`);
	}
	return { templatePath };
}

/**
 * `skip` is called from the middle of the check and has no return value to hand back, so it raises
 * this rather than calling `exit`. Every path then leaves through `runSmokeSteps`, which is what
 * makes the gate importable and fixture-testable at all.
 */
class ExitSignal extends Error {
	code: number;

	constructor(code: number) {
		super(`exit ${code}`);
		this.code = code;
	}
}

function skip(reason: string): never {
	if (process.env['DRIFT_REQUIRED'] === '1') {
		console.error(`[FAIL] DRIFT_REQUIRED=1, would have skipped: ${reason}`);
		throw new ExitSignal(1);
	}
	console.log(`[SKIP] ${reason}`);
	throw new ExitSignal(0);
}

function readAppScripts(root: string): Record<string, string> {
	const text = readLocalFile(root, 'package.json');
	if (text === null) skip('could not read package.json');
	const parsed: unknown = JSON.parse(text);
	const scripts = (parsed as { scripts?: unknown }).scripts;
	if (scripts === undefined) return {};
	if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
		throw new Error('package.json has a "scripts" key that is not an object.');
	}
	return scripts as Record<string, string>;
}

function report(options: SmokeStepsOptions): number {
	const root = options.root ?? repoRoot;

	if (isSpernakitItself(root)) {
		console.log('[SKIP] Smoke step comparison is not applicable to spernakit itself.');
		return 0;
	}

	const version = readSpernakitVersion(root);
	if (version === null) skip('could not determine spernakit_version');

	const spernakitPath = resolveSpernakitPath(options.templatePath, root);
	if (spernakitPath === null) skip('spernakit template repo not available');
	if (!gitTagExists(spernakitPath, version)) {
		skip(`git tag v${version} not found in spernakit repo`);
	}

	const templateText = getTemplateFileAtVersion(spernakitPath, version, SMOKE);
	if (templateText === null) skip(`template ${SMOKE} not found at v${version}`);

	console.log(`Checking smoke steps against the template at v${version}...`);
	console.log(`   App:      ${root}`);
	console.log(`   Template: ${spernakitPath}`);
	console.log('   .templateoverrides does not suppress this check; that is what hides the gap.');
	console.log('');

	const appText = readLocalFile(root, SMOKE);
	if (appText === null) {
		const template = parseSmokeFile(templateText, `the template's ${SMOKE} at v${version}`);
		const declared = Object.values(template.modes).reduce((n, m) => n + m.steps.length, 0);
		console.error(
			`- ${SMOKE}:1 absent; the app carries none of the template's ${declared} steps`,
		);
		console.log(`[FAIL] check:smoke-steps -- ${SMOKE} is absent, so no step in it can run.`);
		return 1;
	}

	return printSmokeSteps({
		appText,
		comparison: compareSmokeSteps({
			app: parseSmokeFile(appText, SMOKE),
			appScripts: readAppScripts(root),
			template: parseSmokeFile(templateText, `the template's ${SMOKE} at v${version}`),
		}),
		version,
	});
}

export function runSmokeSteps(options: SmokeStepsOptions = {}): number {
	try {
		return report(options);
	} catch (err: unknown) {
		// `skip` lands here carrying the code it chose. Anything else is an unreadable or malformed
		// input rather than a verdict about the repository, which rule 2 of the gate conventions
		// makes a 2 -- never a finding.
		if (err instanceof ExitSignal) return err.code;
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(`[FAIL] check-smoke-steps could not run: ${typedErr.message}`);
		return 2;
	}
}

if (import.meta.main) {
	// A mistyped flag must not fall through to a default run that reports a clean pass over the
	// wrong comparison. Bad arguments exit 2, distinct from a missing step's exit 1.
	let options: SmokeStepsOptions = {};
	try {
		options = parseSmokeStepArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`[FAIL] check-smoke-steps: ${(err as Error).message}`);
		console.error(USAGE);
		exit(2);
	}
	exit(runSmokeSteps(options));
}
