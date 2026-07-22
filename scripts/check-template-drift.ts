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
 * skip becomes a failure.
 *
 * File enumeration is derived dynamically from git ls-tree of the template,
 * matching the same exclusions used during app initialization.
 * Classification (branded/infrastructure/pure) comes from template-manifest.json.
 *
 * Usage:
 *   bun scripts/check-template-drift.ts [--template /path/to/spernakit]
 *   DRIFT_REQUIRED=1 bun scripts/check-template-drift.ts   # skips become failures
 */
import path from 'node:path';

import {
	applyTemplateOverrides,
	checkFile,
	classifyFile,
	enumerateTemplateFiles,
	gitTagExists,
	isSpernakitItself,
	loadAppBrandingValues,
	loadClassificationOverrides,
	loadTemplateOverrides,
	printReport,
	readSpernakitVersion,
	resolveSpernakitPath,
	type FileResult,
} from './template-shared.js';

// ===== CONSTANTS =====

const repoRoot = path.resolve(process.cwd());

// ===== HELPERS =====

function parseArgs(): { templatePath: string | undefined } {
	const args = process.argv.slice(2);
	const templateIdx = args.indexOf('--template');
	const templatePath =
		templateIdx !== -1 && args[templateIdx + 1] ? args[templateIdx + 1] : undefined;
	return { templatePath };
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
		const { templatePath } = parseArgs();
		const spernakitPath = resolveSpernakitPath(templatePath, repoRoot);
		if (!spernakitPath) {
			skip('spernakit template repo not available');
		}

		// Validate git tag
		if (!gitTagExists(spernakitPath, version)) {
			skip(`git tag v${version} not found in spernakit repo`);
		}

		// Load classification overrides from spernakit at the declared version
		const overridesResult = loadClassificationOverrides(spernakitPath, version);
		if (!overridesResult) {
			skip(`template-manifest.json not found at v${version} or on disk`);
		}
		const { overrides, source: manifestSource } = overridesResult;
		if (manifestSource === 'filesystem') {
			console.log(
				`   Note: manifest loaded from filesystem (not yet tagged at v${version}).`
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
				checkFile(spernakitPath, version, filePath, category, appBranding, repoRoot)
			);
		}

		// Apply per-app .templateoverrides — converts drifted SKIP/KEEP entries
		// and missing DELETED entries to status 'suppressed' so they don't
		// inflate the drift count.
		const templateOverrides = loadTemplateOverrides(repoRoot);
		const adjusted = applyTemplateOverrides(results, templateOverrides);

		// Filter out files that don't exist in template at this version
		const actionable = adjusted.filter((r) => r.status !== 'missing-in-template');

		// DRIFT_BRANDED_ADVISORY=1 (set by init.ps1 for its scaffold-time gate) makes
		// branded drift advisory: init's own transforms exceed branding normalization
		// by design. Pure/security/missing failures remain strict.
		const totalDrift = printReport(actionable, version, {
			brandedAdvisory: process.env['DRIFT_BRANDED_ADVISORY'] === '1',
		});
		process.exit(totalDrift > 0 ? 1 : 0);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(`Template drift check failed: ${typedErr.message}`);
		process.exit(1);
	}
}

main();
