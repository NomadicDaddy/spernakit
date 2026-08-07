#!/usr/bin/env bun
/**
 * Template drift detection for Spernakit v3.
 *
 * Enforces: every template-managed file in a derived app matches the template at that app's
 * declared `spernakit_version`, or carries an accepted override. No assertion ID: the catalog
 * states the template contract nowhere, and `.templateoverrides` is the contract's escape hatch.
 *
 * Compares template-managed files in a derived application against the expected baseline from the
 * spernakit template at the app's declared spernakit_version. Exits 1 when pure/branded drift,
 * security-infrastructure drift, or missing files are found; advisory infrastructure drift is
 * reported as warnings only.
 *
 * Classification has two infrastructure tiers: advisory `infrastructure` files are expected to
 * carry domain customizations (warn, never fail), while `security-infrastructure` files (auth
 * routes, security config schema, create-api-app) are security-critical — their drift or removal
 * fails the gate in derived apps so a gutted auth route cannot pass silently. Intentional
 * security-infrastructure changes must be acknowledged via .templateoverrides.
 *
 * Preconditions that cannot be met (no spernakit_version, template repo or tag unavailable, missing
 * manifest) are reported as labeled [SKIP] lines and exit 0, unless DRIFT_REQUIRED=1 is set (dance
 * runs), in which case a skip becomes a failure. An unresolvable `--target-version` is not one of
 * those: it is a caller error and always fails (see `fail` below).
 *
 * File enumeration is derived dynamically from git ls-tree of the template, matching the same
 * exclusions used during app initialization. Classification (branded/infrastructure/pure) comes
 * from template-manifest.json.
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
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import {
	applyTemplateOverrides,
	checkFile,
	classifyFile,
	type DeletionScan,
	enumerateTemplateFiles,
	type FileResult,
	gitTagExists,
	isSpernakitItself,
	loadAppBrandingValues,
	loadClassificationOverrides,
	loadTemplateOverrides,
	printReport,
	printRetainedDeletions,
	readSpernakitVersion,
	resolveSpernakitPath,
	scanTemplateDeletions,
} from './template-shared.js';

// ===== CONSTANTS =====

const repoRoot = path.resolve(process.cwd());

// ===== HELPERS =====

export interface TemplateDriftOptions {
	targetVersion?: string | undefined;
	templatePath?: string | undefined;
}

/**
 * `--target-version` with no value at all never reaches the flag-shape guard below: parseArgs
 * raises its own "argument missing" first, and that message names neither the flag's purpose nor
 * its shape. Both paths have to say the same thing, so the parse is wrapped and the generic error
 * restated. The flag-shape guard covers the other direction, where parseArgs takes whatever token
 * follows the option as its value even when that token is itself a flag.
 */
function parseDriftArgs(args: string[]): TemplateDriftOptions {
	const missingValue = new Error(
		'--target-version requires a version (e.g. --target-version 3.31.2)',
	);
	let values: { 'target-version'?: string | undefined; template?: string | undefined };
	try {
		({ values } = parseArgs({
			args,
			options: { 'target-version': { type: 'string' }, template: { type: 'string' } },
			strict: true,
		}));
	} catch (err) {
		const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
		if (args.includes('--target-version') && code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
			throw missingValue;
		}
		throw err;
	}
	const targetVersion = values['target-version'];
	if (targetVersion !== undefined && (targetVersion === '' || targetVersion.startsWith('-'))) {
		throw missingValue;
	}
	return { targetVersion, templatePath: values.template };
}

/**
 * `skip` and `fail` are called from the middle of the check and have no return value to hand back,
 * so they raise this rather than calling `exit`. Every path then leaves through `runTemplateDrift`,
 * which is what makes the gate importable at all.
 */
class ExitSignal extends Error {
	code: number;

	constructor(code: number) {
		super(`exit ${code}`);
		this.code = code;
	}
}

/**
 * Report a precondition skip with a clearly-labeled reason. Skips exit 0 by
 * default, but DRIFT_REQUIRED=1 (set for dance runs) turns them into failures
 * so an unverifiable drift check cannot silently pass as OK.
 */
function skip(reason: string): never {
	if (process.env['DRIFT_REQUIRED'] === '1') {
		console.error(`[FAIL] DRIFT_REQUIRED=1, would have skipped: ${reason}`);
		throw new ExitSignal(1);
	}
	console.log(`[SKIP] ${reason}`);
	throw new ExitSignal(0);
}

/**
 * Report a caller error and exit non-zero, whatever DRIFT_REQUIRED says.
 *
 * A skip means the environment could not answer the question, which is routine for the unattended
 * `smoke:qc` run. This is the other case: the caller asked an unanswerable question. Only
 * `--target-version` reaches here, and only by naming a tag the template repo does not have.
 * Skipping that would exit 0 — and because the skip aborts the whole run, a single mistyped version
 * would also suppress the ORDINARY drift verdict, silently, during the upgrade where drift matters
 * most. An argument the operator typed is theirs to correct, so it is reported rather than absorbed.
 * A `--target-version` with no value at all never gets this far: it exits 2 from the arg parse.
 */
function fail(reason: string): never {
	console.error(`[FAIL] ${reason}`);
	throw new ExitSignal(1);
}

// ===== MAIN =====

function report(options: TemplateDriftOptions): number {
	console.log('Checking template drift...');
	console.log('');

	if (isSpernakitItself(repoRoot)) {
		console.log('[SKIP] Template drift check is not applicable to spernakit itself.');
		return 0;
	}

	const version = readSpernakitVersion(repoRoot);
	if (!version) {
		skip('could not determine spernakit_version');
	}

	const { targetVersion, templatePath } = options;
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

	const overridesResult = loadClassificationOverrides(spernakitPath, version);
	if (!overridesResult) {
		skip(`template-manifest.json not found at v${version} or on disk`);
	}
	const { overrides, source: manifestSource } = overridesResult;
	if (manifestSource === 'filesystem') {
		console.log(`   Note: manifest loaded from filesystem (not yet tagged at v${version}).`);
		console.log('');
	}

	const templateFiles = enumerateTemplateFiles(spernakitPath, version);
	if (templateFiles.length === 0) {
		skip('no template files enumerated from git ls-tree');
	}
	console.log(`   Found ${templateFiles.length} template-managed files.`);
	console.log('');

	// Branding values normalize the branded files before they are compared.
	const appBranding = loadAppBrandingValues(repoRoot);
	const results: FileResult[] = [];

	for (const filePath of templateFiles) {
		const category = classifyFile(filePath, overrides);
		results.push(
			checkFile(
				spernakitPath,
				version,
				filePath,
				category,
				appBranding,
				repoRoot,
				overrides.buildCriticalBranded.includes(filePath),
			),
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
	const scan: DeletionScan | null =
		targetVersion === undefined
			? null
			: scanTemplateDeletions(
					repoRoot,
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

	return totalDrift + retained > 0 ? 1 : 0;
}

export function runTemplateDrift(options: TemplateDriftOptions = {}): number {
	try {
		return report(options);
	} catch (err: unknown) {
		// `skip` and `fail` land here carrying the code they chose; everything else is an
		// unanticipated failure, which is a finding rather than a bad-argument exit.
		if (err instanceof ExitSignal) return err.code;
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(`[FAIL] Template drift check failed: ${typedErr.message}`);
		return 1;
	}
}

if (import.meta.main) {
	// A mistyped flag must not fall through to a default-root run that reports a clean pass over
	// the wrong comparison. Bad arguments exit 2, distinct from drift's exit 1.
	let options: TemplateDriftOptions = {};
	try {
		options = parseDriftArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`[FAIL] check-template-drift: ${(err as Error).message}`);
		console.error(
			'Usage: check-template-drift [--template <dir>] [--target-version <version>]',
		);
		exit(2);
	}
	exit(runTemplateDrift(options));
}
