#!/usr/bin/env bun
/**
 * Report what every accepted `.templateoverrides` entry is holding back.
 *
 * `bun run check:drift` asks whether each template-managed file still matches the template, and a
 * `SKIP` or `KEEP` line answers "stop asking about this one". From that moment the template's own
 * later changes to the file are invisible: the drift report shows the path as `suppressed` with
 * whatever reason its author typed, and nothing shows what the app has stopped receiving.
 *
 * During the 2026-07-27 fleet dance a `SKIP docker/nginx.conf` taken for one CSP token had also
 * withheld the template's `location ~ \.map$` deny block — the one that stops a stray source map
 * exposing the original TypeScript — along with the brotli module loads and `gzip_static`. It was
 * recovered because a human re-read the override text against the new target. This is that read,
 * done by a gate.
 *
 * Run it against the version you are upgrading TO, before the copy pass, so each entry can be
 * re-merged or deliberately kept while there is still a decision to make.
 *
 * Usage:
 *   bun run check:override-deltas -- --target-version 3.31.2
 *   bun run check:override-deltas -- --target-version 3.31.2 --fail-on-delta
 *   bun scripts/check-override-deltas.ts --target-version 3.31.2 --template ../spernakit
 */
import path from 'node:path';
import { argv, exit } from 'node:process';

import { loadAppBrandingValues, loadClassificationOverrides } from './lib/template/classify.ts';
import { computeOverrideDeltas } from './lib/template/override-deltas.ts';
import { printOverrideDeltas } from './lib/template/override-report.ts';
import { loadTemplateOverrides } from './lib/template/overrides.ts';
import {
	getTemplateFileAtVersion,
	gitTagExists,
	isSpernakitItself,
	readLocalFile,
	resolveSpernakitPath,
} from './lib/template/repo.ts';

const repoRoot = path.resolve(process.cwd());

const USAGE =
	'Usage: bun run check:override-deltas -- --target-version <version> [--fail-on-delta]';

interface Options {
	failOnDelta: boolean;
	targetVersion: string;
	templatePath: string | undefined;
}

/**
 * Every precondition failure ends here rather than in a SKIP.
 *
 * `check-template-drift.ts` skips when it cannot verify, because it runs unattended in every
 * `smoke:qc`. This runs only when someone asks what an override is withholding at a named version,
 * and the one answer it must never give is a clean report it could not substantiate.
 */
function fail(message: string): never {
	console.error(`   FAILED: ${message}`);
	exit(1);
}

function parseArgs(): Options {
	const args = argv.slice(2);
	const valueOf = (flag: string): string | undefined => {
		const index = args.indexOf(flag);
		if (index === -1) return undefined;
		const value = args[index + 1];
		if (value === undefined || value.startsWith('--'))
			fail(`${flag} requires a value. ${USAGE}`);
		return value;
	};

	const targetVersion = valueOf('--target-version');
	if (targetVersion === undefined) {
		// Deliberately NOT defaulting to the app's recorded spernakit_version. Comparing an override
		// against the version the app is already on can only ever report that it withholds nothing —
		// a clean report for the exact question the check exists to ask.
		fail(`--target-version is required. ${USAGE}`);
	}
	return {
		failOnDelta: args.includes('--fail-on-delta'),
		targetVersion,
		templatePath: valueOf('--template'),
	};
}

function main(): void {
	const { failOnDelta, targetVersion, templatePath } = parseArgs();

	if (isSpernakitItself(repoRoot)) {
		console.log('   Override delta report is not applicable to spernakit itself.');
		exit(0);
	}

	const spernakitPath = resolveSpernakitPath(templatePath, repoRoot);
	if (spernakitPath === null) fail('the spernakit template repository is required');
	if (!gitTagExists(spernakitPath, targetVersion)) {
		fail(`unavailable tag v${targetVersion} in ${spernakitPath}`);
	}

	const classification = loadClassificationOverrides(spernakitPath, targetVersion);
	if (classification === null) {
		fail(`unavailable scripts/template-manifest.json at v${targetVersion}`);
	}

	console.log(`Checking what .templateoverrides withholds at v${targetVersion}...`);
	console.log(`   App:      ${repoRoot}`);
	console.log(`   Template: ${spernakitPath}`);
	console.log('');

	const entries = computeOverrideDeltas({
		appBranding: loadAppBrandingValues(repoRoot),
		classification: classification.overrides,
		overrides: loadTemplateOverrides(repoRoot),
		readApp: (appPath) => readLocalFile(repoRoot, appPath),
		readTemplate: (tPath) => getTemplateFileAtVersion(spernakitPath, targetVersion, tPath),
	});

	const counts = printOverrideDeltas(entries, targetVersion);

	// An unresolved entry always fails: the report could not substantiate it either way. A withheld
	// delta is a review item, so it is advisory until a caller (the dance, a release gate) asks for
	// it to block with --fail-on-delta.
	if (counts.unavailable > 0) exit(1);
	if (counts.deltas > 0 && failOnDelta) {
		console.log(`   ${counts.deltas} override(s) withhold template content (--fail-on-delta).`);
		exit(1);
	}
	exit(0);
}

main();
