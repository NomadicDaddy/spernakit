#!/usr/bin/env bun
/**
 * Template drift detection for Spernakit v3.
 *
 * Compares template-managed files in a derived application against the
 * expected baseline from the spernakit template at the app's declared
 * spernakit_version. Exits 1 when pure/branded drift, security-infrastructure
 * drift, or missing files are found; advisory infrastructure drift is reported
 * as warnings only.
 *
 * Classification has two infrastructure tiers: advisory `infrastructure` files
 * are expected to carry domain customizations (warn, never fail), while
 * `security-infrastructure` files (auth routes, security config schema,
 * create-api-app) are security-critical — their drift or removal fails the gate
 * in derived apps so a gutted auth route cannot pass silently. Intentional
 * security-infrastructure changes must be acknowledged via .templateoverrides.
 *
 * Preconditions that cannot be met (no spernakit_version, template repo or
 * tag unavailable, missing manifest) are reported as labeled SKIPPED lines
 * and exit 0, unless DRIFT_REQUIRED=1 is set (dance runs), in which case a
 * skip becomes a failure. An unresolvable `--target-version` is not one of
 * those: it is a caller error and always fails (see `fail` below).
 *
 * File enumeration is derived dynamically from git ls-tree of the template,
 * matching the same exclusions used during app initialization.
 * Classification (branded/infrastructure/pure) comes from template-manifest.json.
 *
 * `--target-version` additionally reports the reverse direction: files the template REMOVED between
 * the app's recorded version and the target, which the app still carries. Ordinary drift cannot see
 * these — a removed path simply stops being enumerated, so a dead module inherited at init survives
 * every upgrade looking clean. Retained deletions fail the gate and are reported separately from
 * drift and from `missing-in-app`, because the remedy is the opposite one: delete, not restore.
 *
 * Usage:
 *   bun scripts/check-template-drift.ts [--template /path/to/spernakit]
 *   bun scripts/check-template-drift.ts --target-version 3.31.2   # also report removed files
 *   DRIFT_REQUIRED=1 bun scripts/check-template-drift.ts   # skips become failures
 */
import path from 'node:path';

import {
	applyTemplateOverrides,
	checkFile,
	classifyFile,
	detectRetainedDeletions,
	enumerateTemplateFiles,
	fileExistsInApp,
	type FileResult,
	findRemovedPaths,
	gitTagExists,
	isSpernakitItself,
	loadAppBrandingValues,
	loadClassificationOverrides,
	loadTemplateOverrides,
	printReport,
	printRetainedDeletions,
	readSpernakitVersion,
	resolveSpernakitPath,
	type RetainedDeletion,
	type TemplateOverrides,
} from './template-shared.js';

// ===== CONSTANTS =====

const repoRoot = path.resolve(process.cwd());

// ===== HELPERS =====

function parseArgs(): { targetVersion: string | undefined; templatePath: string | undefined } {
	const args = process.argv.slice(2);
	const valueOf = (flag: string): string | undefined => {
		const idx = args.indexOf(flag);
		return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
	};
	if (args.includes('--target-version') && !valueOf('--target-version')) {
		console.error('   --target-version requires a version (e.g. --target-version 3.31.2)');
		process.exit(1);
	}
	return { targetVersion: valueOf('--target-version'), templatePath: valueOf('--template') };
}

interface DeletionScan {
	deletions: RetainedDeletion[];
	/** Recorded-version paths the target no longer ships — excluded from the drift report. */
	removed: Set<string>;
	targetVersion: string;
}

/**
 * Compare the drift-managed path sets at the two versions.
 *
 * Both sides come from `enumerateTemplateFiles`, so both are app-relative: scaffold-mapped paths
 * (`scaffolding/.gitignore`) are already resolved through `toTemplatePath` to the app path they
 * land on, on both sides, before anything is compared.
 */
function scanTemplateDeletions(
	spernakitPath: string,
	targetVersion: string,
	recordedPaths: string[],
	overrides: TemplateOverrides,
): DeletionScan {
	const input = {
		existsInApp: (filePath: string): boolean => fileExistsInApp(repoRoot, filePath),
		overrides,
		recordedPaths,
		targetPaths: enumerateTemplateFiles(spernakitPath, targetVersion),
	};
	return {
		deletions: detectRetainedDeletions(input),
		removed: findRemovedPaths(input),
		targetVersion,
	};
}

/**
 * Report a precondition skip with a clearly-labeled reason. Skips exit 0 by
 * default, but DRIFT_REQUIRED=1 (set for dance runs) turns them into failures
 * so an unverifiable drift check cannot silently pass as OK.
 */
function skip(reason: string): never {
	if (process.env['DRIFT_REQUIRED'] === '1') {
		console.error(`   FAILED (DRIFT_REQUIRED=1, would have skipped): ${reason}`);
		process.exit(1);
	}
	console.log(`   SKIPPED (${reason})`);
	process.exit(0);
}

/**
 * Report a caller error and exit non-zero, whatever DRIFT_REQUIRED says.
 *
 * A skip means the environment could not answer the question, which is routine for the unattended
 * `smoke:qc` run. This is the other case: the caller asked an unanswerable question. Only
 * `--target-version` reaches here, and only by naming a tag the template repo does not have.
 *
 * Skipping that would exit 0 — and because the skip aborts the whole run, a single mistyped version
 * would also suppress the ORDINARY drift verdict, silently, during the upgrade where drift matters
 * most. An argument the operator typed is theirs to correct, so it is reported as an error rather
 * than absorbed. `check-template-overrides.ts` fails on every precondition for the same reason, and
 * `--target-version` with no value at all already exits 1 a few lines above.
 */
function fail(reason: string): never {
	console.error(`   FAILED: ${reason}`);
	process.exit(1);
}

// ===== MAIN =====

function main(): void {
	try {
		console.log('Checking template drift...');
		console.log('');

		// Skip if this is spernakit itself
		if (isSpernakitItself(repoRoot)) {
			console.log('   Template drift check is not applicable to spernakit itself.');
			process.exit(0);
		}

		// Read spernakit_version
		const version = readSpernakitVersion(repoRoot);
		if (!version) {
			skip('could not determine spernakit_version');
		}

		// Resolve spernakit repo
		const { targetVersion, templatePath } = parseArgs();
		const spernakitPath = resolveSpernakitPath(templatePath, repoRoot);
		if (!spernakitPath) {
			skip('spernakit template repo not available');
		}

		// Validate git tags. Both are checked here, before any comparison work, so neither can abort
		// a run that has already found real drift. The recorded version is environmental and skips;
		// the target version was typed by the caller and fails.
		if (!gitTagExists(spernakitPath, version)) {
			skip(`git tag v${version} not found in spernakit repo`);
		}
		if (targetVersion !== undefined && !gitTagExists(spernakitPath, targetVersion)) {
			fail(
				`--target-version v${targetVersion} not found in spernakit repo ` +
					'(check the version you typed; a skip here would hide ordinary drift too)',
			);
		}

		// Load classification overrides from spernakit at the declared version
		const overridesResult = loadClassificationOverrides(spernakitPath, version);
		if (!overridesResult) {
			skip(`template-manifest.json not found at v${version} or on disk`);
		}
		const { overrides, source: manifestSource } = overridesResult;
		if (manifestSource === 'filesystem') {
			console.log(
				`   Note: manifest loaded from filesystem (not yet tagged at v${version}).`,
			);
			console.log('');
		}

		// Enumerate all template files from git ls-tree
		const templateFiles = enumerateTemplateFiles(spernakitPath, version);
		if (templateFiles.length === 0) {
			skip('no template files enumerated from git ls-tree');
		}
		console.log(`   Found ${templateFiles.length} template-managed files.`);
		console.log('');

		// Load app branding values for branded file normalization
		const appBranding = loadAppBrandingValues(repoRoot);

		// Check all files, classifying each as pure/branded/infrastructure
		const results: FileResult[] = [];

		for (const filePath of templateFiles) {
			const category = classifyFile(filePath, overrides);
			results.push(
				checkFile(spernakitPath, version, filePath, category, appBranding, repoRoot),
			);
		}

		// Apply per-app .templateoverrides — converts drifted SKIP/KEEP entries
		// and missing DELETED entries to status 'suppressed' so they don't
		// inflate the drift count.
		const templateOverrides = loadTemplateOverrides(repoRoot);
		const adjusted = applyTemplateOverrides(results, templateOverrides);

		// Paths the target version dropped belong to the deletion report exclusively: judged against
		// the recorded version they read as drifted or missing, and both of those labels tell the
		// operator to restore a file the target no longer ships.
		const scan =
			targetVersion === undefined
				? null
				: scanTemplateDeletions(
						spernakitPath,
						targetVersion,
						templateFiles,
						templateOverrides,
					);

		// Filter out files that don't exist in template at this version
		const actionable = adjusted.filter(
			(r) => r.status !== 'missing-in-template' && scan?.removed.has(r.filePath) !== true,
		);

		// DRIFT_BRANDED_ADVISORY=1 (set by init.ps1 for its scaffold-time gate) makes
		// branded drift advisory: init's own transforms exceed branding normalization
		// by design. Pure/security/missing failures remain strict.
		const totalDrift = printReport(actionable, version, {
			brandedAdvisory: process.env['DRIFT_BRANDED_ADVISORY'] === '1',
		});

		// The reverse direction: paths the target version no longer ships that the app still has.
		const retained =
			scan === null ? 0 : printRetainedDeletions(scan.deletions, version, scan.targetVersion);

		process.exit(totalDrift + retained > 0 ? 1 : 0);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(`Template drift check failed: ${typedErr.message}`);
		process.exit(1);
	}
}

main();
