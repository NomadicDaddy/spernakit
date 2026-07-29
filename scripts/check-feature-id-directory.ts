#!/usr/bin/env bun
/**
 * Require every feature record's `id` to equal the directory that holds it.
 *
 * aidd's roadmap tooling builds its directory-to-id lookup from `feature.json.id` and then writes
 * dependency arrays in terms of those ids. A record whose id has drifted from its directory name
 * therefore does not merely look untidy: every other feature that depends on it gets the stale
 * spelling written into its own dependencies on the next `roadmap:apply`, so one renamed directory
 * silently propagates through the graph. Directory names are the stable key — this check makes the
 * id follow them.
 *
 * Unlike `check:template-feature-versions` this is a universal invariant, so it runs in derived
 * applications too and skips only when there is no feature metadata to grade at all.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { cwd, exit } from 'node:process';

interface FeatureProblem {
	path: string;
	reason: string;
}

export interface FeatureIdDirectoryResult {
	code: number;
	examined: number;
	mismatched: FeatureProblem[];
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

function skip(reason: string): FeatureIdDirectoryResult {
	console.log(`[SKIP] check:feature-id-directory not applicable: ${reason}`);
	return { code: 0, examined: 0, mismatched: [], skippedReason: reason };
}

export function runFeatureIdDirectoryCheck(projectRoot = cwd()): FeatureIdDirectoryResult {
	const featuresRoot = join(projectRoot, '.aidd', 'features');
	if (!existsSync(featuresRoot)) {
		return skip('.aidd/features/ is absent; there is no feature metadata to grade.');
	}

	const featureFiles = collectFeatureFiles(projectRoot);
	if (featureFiles.length === 0) {
		// An empty features directory means the enumeration found nothing to check, which would
		// otherwise pass vacuously and report success over zero records.
		console.error('[FAIL] check:feature-id-directory examined 0 feature records.');
		return { code: 1, examined: 0, mismatched: [] };
	}

	const mismatched: FeatureProblem[] = [];

	for (const featurePath of featureFiles) {
		const shownPath = displayPath(projectRoot, featurePath);
		const dirName = basename(dirname(featurePath));

		let feature: Record<string, unknown>;
		try {
			feature = readJsonObject(featurePath);
		} catch (err) {
			mismatched.push({
				path: shownPath,
				reason: err instanceof Error ? err.message : String(err),
			});
			continue;
		}

		const id = feature['id'];
		if (typeof id !== 'string' || id.trim() === '') {
			mismatched.push({ path: shownPath, reason: 'id must be a non-empty string' });
			continue;
		}
		if (id !== dirName) {
			mismatched.push({
				path: shownPath,
				reason: `id is "${id}" but the directory is "${dirName}"`,
			});
		}
	}

	if (mismatched.length > 0) {
		console.error(
			`[FAIL] check:feature-id-directory found ${mismatched.length} record(s) whose id does not match their directory, across ${featureFiles.length} feature records.`,
		);
		for (const problem of mismatched) console.error(`- ${problem.path}: ${problem.reason}`);
		console.error(
			'Rename the id to match the directory. Directory names are the stable key that roadmap dependencies resolve through.',
		);
		return { code: 1, examined: featureFiles.length, mismatched };
	}

	console.log(
		`[OK] Every feature id matches its directory (${featureFiles.length} feature records).`,
	);
	return { code: 0, examined: featureFiles.length, mismatched };
}

function projectRootFromArgs(args: string[]): string {
	const index = args.indexOf('--project-dir');
	if (index === -1) return cwd();
	const value = args[index + 1];
	// An empty value must not fall through to resolve(''), which silently returns the current
	// working directory and grades the wrong repository.
	if (value === undefined || value.trim() === '' || value.startsWith('--')) {
		throw new Error('--project-dir requires a path.');
	}
	return resolve(value);
}

if (import.meta.main) {
	try {
		exit(runFeatureIdDirectoryCheck(projectRootFromArgs(Bun.argv.slice(2))).code);
	} catch (err) {
		console.error(
			`[FAIL] check:feature-id-directory: ${err instanceof Error ? err.message : String(err)}`,
		);
		exit(1);
	}
}
