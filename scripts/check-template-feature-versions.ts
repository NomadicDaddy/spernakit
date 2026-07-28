#!/usr/bin/env bun
/**
 * Require every Spernakit-owned feature record to declare the template version that owns it.
 *
 * Derived applications legitimately contain app-owned features without `spernakit_version`, so
 * this check is applicable only when the project root package is the Spernakit template. Published
 * clones may omit the gitignored `.aidd/` tree and also receive an explicit not-applicable result.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { cwd, exit } from 'node:process';

const TEMPLATE_PACKAGE_NAME = 'spernakit';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface FeatureProblem {
	path: string;
	reason: string;
}

export interface TemplateFeatureVersionResult {
	code: number;
	examined: number;
	invalid: FeatureProblem[];
	missing: string[];
	skippedReason?: string;
}

function toPosix(path: string): string {
	return path.split(sep).join('/');
}

function displayPath(projectRoot: string, path: string): string {
	return toPosix(relative(projectRoot, path));
}

function readJsonObject(path: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${toPosix(path)} must contain one JSON object.`);
	}
	return parsed as Record<string, unknown>;
}

function collectFeatureFiles(projectRoot: string): string[] {
	const featuresRoot = join(projectRoot, '.aidd', 'features');
	return readdirSync(featuresRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(featuresRoot, entry.name, 'feature.json'))
		.filter((path) => existsSync(path))
		.sort();
}

function skip(reason: string): TemplateFeatureVersionResult {
	console.log(`[SKIP] check:template-feature-versions not applicable: ${reason}`);
	return { code: 0, examined: 0, invalid: [], missing: [], skippedReason: reason };
}

export function runTemplateFeatureVersionCheck(projectRoot = cwd()): TemplateFeatureVersionResult {
	const packagePath = join(projectRoot, 'package.json');
	if (!existsSync(packagePath)) {
		throw new Error(`package.json is missing from ${toPosix(projectRoot)}.`);
	}

	const packageJson = readJsonObject(packagePath);
	const packageName = packageJson['name'];
	if (typeof packageName !== 'string' || packageName.trim() === '') {
		throw new Error('package.json must declare a non-empty string name.');
	}
	if (packageName !== TEMPLATE_PACKAGE_NAME) {
		return skip(
			`package.json name is "${packageName}", not "${TEMPLATE_PACKAGE_NAME}"; app-owned features may omit spernakit_version.`,
		);
	}

	const featuresRoot = join(projectRoot, '.aidd', 'features');
	if (!existsSync(featuresRoot)) {
		return skip(
			'.aidd/features/ is absent; published template clones do not carry gitignored feature metadata.',
		);
	}

	const featureFiles = collectFeatureFiles(projectRoot);
	if (featureFiles.length === 0) {
		console.error(
			'[FAIL] check:template-feature-versions examined 0 feature records in the template.',
		);
		return { code: 1, examined: 0, invalid: [], missing: [] };
	}

	const invalid: FeatureProblem[] = [];
	const missing: string[] = [];

	for (const featurePath of featureFiles) {
		const shownPath = displayPath(projectRoot, featurePath);
		let feature: Record<string, unknown>;
		try {
			feature = readJsonObject(featurePath);
		} catch (err) {
			invalid.push({
				path: shownPath,
				reason: err instanceof Error ? err.message : String(err),
			});
			continue;
		}

		if (!Object.hasOwn(feature, 'spernakit_version')) {
			missing.push(shownPath);
			continue;
		}

		const version = feature['spernakit_version'];
		if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
			invalid.push({
				path: shownPath,
				reason: 'spernakit_version must be a concrete semantic version string',
			});
		}
	}

	if (missing.length > 0 || invalid.length > 0) {
		console.error(
			`[FAIL] check:template-feature-versions found ${missing.length} missing and ${invalid.length} invalid marker(s) across ${featureFiles.length} feature records.`,
		);
		for (const path of missing) console.error(`- ${path}: missing spernakit_version`);
		for (const problem of invalid) console.error(`- ${problem.path}: ${problem.reason}`);
		return { code: 1, examined: featureFiles.length, invalid, missing };
	}

	console.log(
		`[OK] Every template-owned feature carries spernakit_version (${featureFiles.length} feature records).`,
	);
	return { code: 0, examined: featureFiles.length, invalid, missing };
}

function projectRootFromArgs(args: string[]): string {
	const index = args.indexOf('--project-dir');
	if (index === -1) return cwd();
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) {
		throw new Error('--project-dir requires a path.');
	}
	return resolve(value);
}

if (import.meta.main) {
	try {
		exit(runTemplateFeatureVersionCheck(projectRootFromArgs(Bun.argv.slice(2))).code);
	} catch (err) {
		console.error(
			`[FAIL] check:template-feature-versions: ${err instanceof Error ? err.message : String(err)}`,
		);
		exit(1);
	}
}
