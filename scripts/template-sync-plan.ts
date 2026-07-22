#!/usr/bin/env bun
/**
 * Generate a read-only template sync packet for a derived Spernakit app.
 *
 * This script classifies template-managed files into pure, branded, and
 * infrastructure buckets, then writes review artifacts under upgrade-review/.
 * It never writes to the target app source.
 *
 * Usage:
 *   bun scripts/template-sync-plan.ts --app ../acme-monitor --from 3.28.2 --to 3.29.0
 *   bun scripts/template-sync-plan.ts --app ../acme-monitor
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
	applyTemplateOverrides,
	checkFile,
	classifyFile,
	enumerateTemplateFiles,
	gitTagExists,
	loadAppBrandingValues,
	loadClassificationOverrides,
	loadTemplateOverrides,
	normalizeLineEndings,
	readLocalFile,
	readSpernakitVersion,
	type DriftCategory,
	type FileResult,
} from './template-shared.ts';

interface Args {
	appPath: string;
	fromVersion: string | undefined;
	outDir: string | undefined;
	toVersion: string | undefined;
}

export const MIN_SUPPORTED_TEMPLATE_VERSION = '3.28.2';

function parseCliArgs(): Args {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			app: { type: 'string' },
			from: { type: 'string' },
			out: { type: 'string' },
			to: { type: 'string' },
		},
		strict: true,
	});

	if (!values.app) {
		console.error('Missing required --app <path> argument.');
		process.exit(1);
	}

	return {
		appPath: resolve(values.app),
		fromVersion: values.from,
		outDir: values.out,
		toVersion: values.to,
	};
}

function normalizeVersion(version: string): string {
	return version.startsWith('v') ? version.slice(1) : version;
}

function versionParts(version: string): [number, number, number] | null {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function supportedSourceVersionError(version: string): null | string {
	const candidate = versionParts(normalizeVersion(version));
	const floor = versionParts(MIN_SUPPORTED_TEMPLATE_VERSION);
	if (!candidate || !floor) return `Invalid template source version: ${version}`;
	const comparison =
		candidate[0] - floor[0] || candidate[1] - floor[1] || candidate[2] - floor[2];
	return comparison < 0
		? `Template sync supports source versions v${MIN_SUPPORTED_TEMPLATE_VERSION} and later; ` +
				`v${normalizeVersion(version)} predates the public baseline.`
		: null;
}

function readPackageVersion(repoRoot: string): string | undefined {
	try {
		const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as {
			version?: string;
		};
		return pkg.version;
	} catch {
		return undefined;
	}
}

function writeList(path: string, files: string[]): void {
	writeFileSync(path, files.length > 0 ? `${files.join('\n')}\n` : '', 'utf-8');
}

function writeInfrastructureDiff(
	spernakitPath: string,
	toVersion: string,
	appPath: string,
	filePath: string,
	diffDir: string
): void {
	const templateRef = `v${toVersion}:${filePath}`;
	const template = Bun.spawnSync(['git', '-C', spernakitPath, 'show', templateRef], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	if (template.exitCode !== 0) return;

	const appContent = readLocalFile(appPath, filePath);
	if (appContent === null) return;

	const safeName = filePath.replace(/[\\/]/g, '__');
	const templateTemp = join(diffDir, `${safeName}.template.tmp`);
	const appTemp = join(diffDir, `${safeName}.app.tmp`);
	const diffPath = join(diffDir, `${safeName}.diff`);

	writeFileSync(templateTemp, normalizeLineEndings(template.stdout.toString()), 'utf-8');
	writeFileSync(appTemp, normalizeLineEndings(appContent), 'utf-8');

	const diff = Bun.spawnSync(
		['git', 'diff', '--no-index', '--unified=3', '--', templateTemp, appTemp],
		{ stderr: 'pipe', stdout: 'pipe' }
	);
	const output = diff.stdout.toString() || diff.stderr.toString();
	writeFileSync(diffPath, output, 'utf-8');
	rmSync(templateTemp, { force: true });
	rmSync(appTemp, { force: true });
}

function groupFiles(results: FileResult[], category: DriftCategory): string[] {
	return results
		.filter((r) => r.category === category && r.status !== 'identical')
		.map((r) => `${r.filePath} (${r.status})`)
		.sort();
}

function main(): void {
	const args = parseCliArgs();
	if (!existsSync(join(args.appPath, 'package.json'))) {
		console.error(`App path does not look like a repo root: ${args.appPath}`);
		process.exit(1);
	}

	const spernakitPath = resolve(join(dirname(import.meta.path), '..'));
	const fromVersion = normalizeVersion(
		args.fromVersion ?? readSpernakitVersion(args.appPath) ?? ''
	);
	const toVersion = normalizeVersion(args.toVersion ?? readPackageVersion(spernakitPath) ?? '');
	if (!fromVersion || !toVersion) {
		console.error('Unable to determine --from and --to versions.');
		process.exit(1);
	}
	const sourceVersionError = supportedSourceVersionError(fromVersion);
	if (sourceVersionError) {
		console.error(sourceVersionError);
		process.exit(1);
	}
	if (!gitTagExists(spernakitPath, fromVersion)) {
		console.error(`Template tag v${fromVersion} was not found.`);
		process.exit(1);
	}
	if (!gitTagExists(spernakitPath, toVersion)) {
		console.error(`Template tag v${toVersion} was not found.`);
		process.exit(1);
	}

	const overridesResult = loadClassificationOverrides(spernakitPath, toVersion);
	if (!overridesResult) {
		console.error(`Could not load scripts/template-manifest.json for v${toVersion}.`);
		process.exit(1);
	}

	const appSlug = basename(args.appPath);
	const outRoot = resolve(args.outDir ?? join(spernakitPath, 'upgrade-review', appSlug));
	const diffDir = join(outRoot, 'infrastructure-diffs');
	rmSync(outRoot, { force: true, recursive: true });
	mkdirSync(diffDir, { recursive: true });

	const appBranding = loadAppBrandingValues(args.appPath);
	const templateFiles = enumerateTemplateFiles(spernakitPath, toVersion);
	const results = applyTemplateOverrides(
		templateFiles.map((filePath) =>
			checkFile(
				spernakitPath,
				toVersion,
				filePath,
				classifyFile(filePath, overridesResult.overrides),
				appBranding,
				args.appPath
			)
		),
		loadTemplateOverrides(args.appPath)
	).filter((r) => r.status !== 'missing-in-template');

	const pure = groupFiles(results, 'pure');
	const branded = groupFiles(results, 'branded');
	const infrastructureResults = results.filter(
		(r) =>
			(r.category === 'infrastructure' || r.category === 'security-infrastructure') &&
			r.status !== 'identical'
	);
	const infrastructure = infrastructureResults.map((r) => `${r.filePath} (${r.status})`).sort();
	const blocked = results
		.filter((r) => r.status === 'suppressed')
		.map(
			(r) =>
				`${r.filePath} [${r.suppression?.action ?? 'SKIP'}] ${r.suppression?.reason ?? ''}`
		)
		.sort();

	for (const result of infrastructureResults) {
		if (result.status === 'drifted') {
			writeInfrastructureDiff(
				spernakitPath,
				toVersion,
				args.appPath,
				result.filePath,
				diffDir
			);
		}
	}

	writeList(join(outRoot, 'pure-copy.txt'), pure);
	writeList(join(outRoot, 'branded-copy.txt'), branded);
	writeList(join(outRoot, 'infrastructure-review.txt'), infrastructure);
	writeList(join(outRoot, 'blocked-app-owned.txt'), blocked);

	const summary = [
		`# Template Sync Plan: ${appSlug}`,
		'',
		`- From: v${fromVersion}`,
		`- To: v${toVersion}`,
		`- App path: ${args.appPath}`,
		`- Pure copy candidates: ${pure.length}`,
		`- Branded copy candidates: ${branded.length}`,
		`- Infrastructure review candidates: ${infrastructure.length}`,
		`- Suppressed/app-owned files: ${blocked.length}`,
		'',
		'This is a read-only review packet. Apply changes manually after reviewing each bucket.',
		'Files omitted from scripts/template-manifest.json default to pure and appear in pure-copy.txt when drifted or missing.',
		'',
	].join('\n');
	writeFileSync(join(outRoot, 'summary.md'), summary, 'utf-8');

	console.log(`Template sync plan written to ${outRoot}`);
}

if (import.meta.main) main();
