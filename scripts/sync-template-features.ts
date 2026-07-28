#!/usr/bin/env bun
/**
 * Sync Spernakit's template-owned feature records into derived applications.
 *
 *   bun scripts/sync-template-features.ts                    # pull: cwd is the app
 *   bun scripts/sync-template-features.ts --check            # pull, plan only, exit 1 if drifted
 *   bun scripts/sync-template-features.ts --app ../deeper    # push, from the template
 *   bun scripts/sync-template-features.ts --all              # push to every app in spernakit.psd1
 *
 * A feature record is the machine-checkable half of the template contract, and until now the only
 * thing that ever copied one downstream was a paragraph of prose in the upgrade skill, executed by
 * hand. It had run on four of eleven apps.
 *
 * A write run applies the plan except for records whose overwrite would destroy app-authored
 * `spec`/`notes`/`description`/`summary`: those are left on disk, listed, and the run exits 1.
 * `--overwrite-app-text` discards them in favour of the template copy, the marked-record sibling of
 * `--adopt`. The text has to be resolved somewhere — backported upstream, or recorded as a
 * `DEVIATES:` app-owned feature — and a sync that destroyed it first would leave nothing to resolve.
 *
 * Records named like process artifacts — `remediation-<date>-…`, `audit-<slug>-<digits>-…` — are
 * never synced. They are findings from the TEMPLATE'S own development; their content reaches apps by
 * being folded into a durable feature, and the finding itself is deleted upstream once folded. Every
 * dance mints more, so the filter is permanent rather than a cleanup. See `lib/template-features/
 * source.ts` for why the pattern must stay narrower than a bare `audit-` prefix.
 *
 * Pull mode is the gate and skips when it cannot answer honestly, exactly like `check:drift`:
 * unresolvable template, and — load-bearing — an app whose `spernakit_version` does not match the
 * template's. `.aidd/` is gitignored in the template, so there is no tagged baseline to compare
 * against; the comparison is against a moving HEAD, and without version parity every app would go
 * red the moment spernakit bumped. `TEMPLATE_FEATURES_REQUIRED=1` turns skips into failures for
 * fleet runs, matching `DRIFT_REQUIRED=1`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { cwd, env, exit } from 'node:process';

import { applicationsRootForManifest, loadFleetManifest } from './lib/fleet/manifest.ts';
import { applyPlan } from './lib/template-features/apply.ts';
import {
	countActionable,
	emitJsonPlan,
	printAppTextBlocked,
	printSyncReport,
} from './lib/template-features/report.ts';
import { auditResidentRecords, printResidentDefects } from './lib/template-features/resident.ts';
import { loadCorpus, validateTemplateCorpus } from './lib/template-features/source.ts';
import { buildSyncPlan } from './lib/template-features/sync.ts';
import {
	isSpernakitItself,
	readSpernakitVersion,
	resolveSpernakitPath,
} from './lib/template/repo.ts';

const MANIFEST = 'spernakit.psd1';

interface CliOptions {
	adopt: boolean;
	all: boolean;
	apps: string[];
	check: boolean;
	json: boolean;
	overwriteAppText: boolean;
	prune: boolean;
	template: string | undefined;
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		adopt: false,
		all: false,
		apps: [],
		check: false,
		json: false,
		overwriteAppText: false,
		prune: true,
		template: undefined,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const takeValue = (flag: string): string => {
			const value = args[index + 1];
			if (value === undefined || value.trim() === '' || value.startsWith('--')) {
				throw new Error(`${flag} requires a path.`);
			}
			index += 1;
			return value;
		};

		if (arg === '--adopt') options.adopt = true;
		else if (arg === '--all') options.all = true;
		else if (arg === '--app') options.apps.push(takeValue('--app'));
		else if (arg === '--check') options.check = true;
		else if (arg === '--json') options.json = true;
		else if (arg === '--no-prune') options.prune = false;
		else if (arg === '--overwrite-app-text') options.overwriteAppText = true;
		else if (arg === '--template') options.template = takeValue('--template');
		else throw new Error(`Unknown argument: ${String(arg)}`);
	}

	return options;
}

/**
 * A precondition the environment could not satisfy. Exits 0 so an unattended `smoke:qc` in an app
 * without a sibling template checkout stays green, unless a fleet run demanded an answer.
 */
function skip(reason: string): never {
	if (env['TEMPLATE_FEATURES_REQUIRED'] === '1') {
		console.error(`   FAILED (TEMPLATE_FEATURES_REQUIRED=1, would have skipped): ${reason}`);
		exit(1);
	}
	console.log(`   SKIPPED (${reason})`);
	exit(0);
}

function readPackageVersion(root: string): string | undefined {
	try {
		const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
			string,
			unknown
		>;
		const version = parsed['version'];
		return typeof version === 'string' ? version : undefined;
	} catch {
		return undefined;
	}
}

/** Plan, report and (unless `--check`) write one application. Returns its exit code. */
async function syncOne(
	templateRoot: string,
	appRoot: string,
	options: CliOptions,
): Promise<number> {
	const outcome = buildSyncPlan(templateRoot, appRoot, {
		adopt: options.adopt,
		prune: options.prune,
	});

	// `--json` never writes, but it must still answer the same question `--check` answers in the
	// printed report. Emitting a drifted plan and exiting 0 makes the machine-readable form the one
	// output a pipeline cannot gate on.
	const drifted = countActionable(outcome.plan) > 0 || outcome.plan.roadmapChanged;
	if (options.json) {
		emitJsonPlan(appRoot, outcome);
		if (outcome.plan.errors.length > 0) return 1;
		return options.check && drifted ? 1 : 0;
	}

	printSyncReport(outcome.plan, {
		appLabel: basename(appRoot),
		created: outcome.created,
		durable: outcome.durable,
		roadmapChanged: outcome.plan.roadmapChanged,
	});

	if (outcome.plan.errors.length > 0) return 1;
	if (options.check) return drifted ? 1 : 0;

	const result = await applyPlan(appRoot, outcome.plan, {
		overwriteAppText: options.overwriteAppText,
	});
	console.log(
		`   Wrote ${result.written.length} record(s), removed ${result.removed.length}, roadmap ${
			result.roadmapWritten ? 'updated' : 'unchanged'
		}.`,
	);
	console.log('   Next: run `roadmap:apply` in this app, then `bun run check:aidd-format`.');
	console.log('');
	if (result.blocked.length > 0) {
		printAppTextBlocked(result.blocked);
		return 1;
	}
	return 0;
}

/** Refuse to run against a source that its own repository gates would reject. */
function requireUsableTemplate(templateRoot: string): void {
	const problems = validateTemplateCorpus(templateRoot);
	if (problems.length === 0) return;
	console.error('');
	console.error(`   The template corpus at ${templateRoot} is not fit to sync from:`);
	for (const problem of problems) console.error(`     ${problem}`);
	console.error('   No application was touched.');
	exit(1);
}

function fleetAppRoots(templateRoot: string): string[] {
	const manifestPath = join(templateRoot, MANIFEST);
	if (!existsSync(manifestPath)) {
		throw new Error(
			`${MANIFEST} not found at ${manifestPath}; --all needs the fleet manifest.`,
		);
	}
	const applicationsRoot = applicationsRootForManifest(manifestPath);
	return loadFleetManifest(manifestPath)
		.filter((entry) => entry.slug !== 'spernakit')
		.map((entry) => join(applicationsRoot, entry.slug));
}

async function runPush(repoRoot: string, options: CliOptions): Promise<number> {
	const templateRoot = options.template === undefined ? repoRoot : resolve(options.template);
	if (!isSpernakitItself(repoRoot)) {
		console.error(
			`   --app/--all pushes FROM the template, but ${repoRoot} is not spernakit. Run it from` +
				' the template checkout, or use the no-argument pull form inside this application.',
		);
		return 1;
	}
	requireUsableTemplate(templateRoot);

	const appRoots = [
		...options.apps.map((path) => resolve(path)),
		...(options.all ? fleetAppRoots(templateRoot) : []),
	];
	if (appRoots.length === 0) return 0;

	let code = 0;
	for (const appRoot of appRoots) {
		if (!existsSync(appRoot)) {
			console.error(`   Application directory not found: ${appRoot}`);
			code = 1;
			continue;
		}
		code = Math.max(code, await syncOne(templateRoot, appRoot, options));
	}
	return code;
}

async function runPull(repoRoot: string, options: CliOptions): Promise<number> {
	if (isSpernakitItself(repoRoot)) {
		console.log('   Template feature sync is not applicable to spernakit itself.');
		return 0;
	}

	const templateRoot = resolveSpernakitPath(options.template, repoRoot);

	// Ahead of every skip below, deliberately. These two defects are wrong at any version skew, and
	// the parity skip would otherwise hide them for the whole window between a template bump and
	// this app's next dance — which is exactly how two leaked process records survived in four apps.
	const defects = auditResidentRecords(
		loadCorpus(repoRoot),
		templateRoot === null ? null : loadCorpus(templateRoot),
	);
	if (printResidentDefects(basename(repoRoot), defects) > 0) return 1;

	if (templateRoot === null) skip('spernakit template repo not available');
	if (!existsSync(join(templateRoot, '.aidd', 'features'))) {
		skip('the template checkout carries no .aidd/features/ metadata');
	}

	const appVersion = readSpernakitVersion(repoRoot);
	if (appVersion === null) skip('could not determine spernakit_version');
	const templateVersion = readPackageVersion(templateRoot);
	if (templateVersion === undefined) skip('could not read the template package version');
	if (appVersion !== templateVersion) {
		// `.aidd/` is gitignored upstream, so there is no tag to compare against and the only
		// baseline available is the template's working tree. Comparing an app to a template that
		// has moved on reports every intervening edit as app drift.
		skip(`app is at v${appVersion} but the template checkout is v${templateVersion}`);
	}

	requireUsableTemplate(templateRoot);
	return await syncOne(templateRoot, repoRoot, options);
}

async function main(): Promise<void> {
	const options = parseArgs(Bun.argv.slice(2));
	const repoRoot = resolve(cwd());
	const push = options.all || options.apps.length > 0;
	exit(push ? await runPush(repoRoot, options) : await runPull(repoRoot, options));
}

if (import.meta.main) {
	try {
		await main();
	} catch (err) {
		console.error(
			`   Template feature sync failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		exit(1);
	}
}
