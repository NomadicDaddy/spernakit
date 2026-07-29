/**
 * Loading and validating a `.aidd` feature corpus.
 *
 * Two jobs live here because they are the same question asked twice: what is in this repository's
 * `.aidd/`, and is it fit to sync FROM. The second is the tool's anti-vacuity guard — a sync that
 * runs against a broken or empty template corpus would quietly overwrite every app with nothing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FeatureCorpus, FeatureRecord, RoadmapDocument } from './types.ts';

import { runFeatureIdDirectoryCheck } from '../../check-feature-id-directory.ts';
import { runTemplateFeatureVersionCheck } from '../../check-template-feature-versions.ts';
import { isSpernakitItself } from '../template/repo.ts';

/**
 * Records that are artifacts of the TEMPLATE'S OWN development process, never capabilities an app
 * inherits. Their content reaches apps by being folded into a durable feature, which then syncs; the
 * finding record itself is deleted upstream once folded. Every dance mints more of them, so this is
 * a permanent filter rather than a one-time cleanup.
 *
 * The prefix must stay this specific. A bare `audit-` would swallow `audit-logs` — a real capability
 * feature shipped by the template and present in four apps — and a derived app's own
 * `audit-change-history`. Both matter: the sync would report them for deletion, and a hand-run
 * prefix match is exactly how someone deletes a capability record believing it to be a finding.
 */
export const EPHEMERAL = /^(remediation-\d{8}-|audit-[a-z0-9]+(?:-[a-z0-9]+)*?-\d{6,}-)/;

export function isEphemeralDir(dirName: string): boolean {
	return EPHEMERAL.test(dirName);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	if (!isObject(parsed)) throw new Error(`${path} must contain one JSON object.`);
	return parsed;
}

/**
 * Read `.aidd/roadmap.json`.
 *
 * Absent returns `null`, which callers read as "this app has no roadmap yet, seed one". Malformed
 * throws, because the two must never be confused: seeding over a roadmap that merely failed to parse
 * would replace an app's own milestones with the template's.
 */
function readRoadmap(root: string): null | RoadmapDocument {
	const path = join(root, '.aidd', 'roadmap.json');
	if (!existsSync(path)) return null;

	const parsed = readJsonObject(path);
	const features = parsed['features'];
	const milestones = parsed['milestones'];
	if (!isObject(features)) throw new Error(`${path} is missing an object 'features' property.`);
	if (!isObject(milestones)) {
		throw new Error(`${path} is missing an object 'milestones' property.`);
	}
	return parsed as RoadmapDocument;
}

export function loadCorpus(root: string): FeatureCorpus {
	const featuresRoot = join(root, '.aidd', 'features');
	const corpus: FeatureCorpus = {
		dirs: [],
		featureOnlyDirs: new Set<string>(),
		features: new Map<string, FeatureRecord>(),
		invalid: new Map<string, string>(),
		roadmap: readRoadmap(root),
		root,
	};
	if (!existsSync(featuresRoot)) return corpus;

	for (const entry of readdirSync(featuresRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dirPath = join(featuresRoot, entry.name);
		const featurePath = join(dirPath, 'feature.json');
		if (!existsSync(featurePath)) continue;

		corpus.dirs.push(entry.name);
		const contents = readdirSync(dirPath);
		if (contents.length === 1) corpus.featureOnlyDirs.add(entry.name);
		try {
			corpus.features.set(entry.name, readJsonObject(featurePath));
		} catch (err) {
			corpus.invalid.set(entry.name, err instanceof Error ? err.message : String(err));
		}
	}

	corpus.dirs.sort();
	return corpus;
}

/** Template directories the sync propagates: everything that is not a process artifact. */
export function durableDirs(corpus: FeatureCorpus): string[] {
	return corpus.dirs.filter((dirName) => !isEphemeralDir(dirName));
}

function validateRoadmapCoverage(corpus: FeatureCorpus, problems: string[]): void {
	const roadmap = corpus.roadmap;
	if (roadmap === null) {
		problems.push('.aidd/roadmap.json is absent, so synced records would have no milestone.');
		return;
	}

	const durable = new Set(durableDirs(corpus));
	const entries = Object.keys(roadmap.features);
	const orphans = entries.filter((dirName) => !corpus.features.has(dirName));
	const unmapped = [...durable].filter((dirName) => !Object.hasOwn(roadmap.features, dirName));

	// An orphan is a hard error inside aidd's own `roadmap:apply` (it reports "directory not
	// found" and aborts the whole run), so copying one into an app breaks that app's tooling.
	if (orphans.length > 0) {
		problems.push(
			`.aidd/roadmap.json has ${orphans.length} entr(y/ies) with no feature directory: ${orphans
				.slice(0, 5)
				.join(', ')}`,
		);
	}
	if (unmapped.length > 0) {
		problems.push(
			`${unmapped.length} durable feature director(y/ies) have no roadmap entry: ${unmapped
				.slice(0, 5)
				.join(', ')}`,
		);
	}
}

/**
 * Decide whether a repository may be used as the sync source.
 *
 * The first two gates are literally the shipped `check:template-feature-versions` and
 * `check:feature-id-directory` functions rather than reimplementations of them, so the sync can
 * never run against a corpus its own repository gates reject. They print their usual OK/FAIL lines;
 * that output is the evidence the source was graded.
 */
export function validateTemplateCorpus(root: string): string[] {
	const problems: string[] = [];

	if (!isSpernakitItself(root)) {
		problems.push(
			`${root} is not the Spernakit template (package.json name is not "spernakit").`,
		);
		return problems;
	}
	if (!existsSync(join(root, '.aidd', 'features'))) {
		problems.push(`${root} has no .aidd/features/ to sync from.`);
		return problems;
	}

	const versions = runTemplateFeatureVersionCheck(root);
	if (versions.code !== 0)
		problems.push('check:template-feature-versions fails on the template.');
	if (versions.skippedReason !== undefined) {
		problems.push(`check:template-feature-versions skipped: ${versions.skippedReason}`);
	}

	const ids = runFeatureIdDirectoryCheck(root);
	if (ids.code !== 0) problems.push('check:feature-id-directory fails on the template.');
	if (ids.skippedReason !== undefined) {
		problems.push(`check:feature-id-directory skipped: ${ids.skippedReason}`);
	}

	let corpus: FeatureCorpus;
	try {
		corpus = loadCorpus(root);
	} catch (err) {
		problems.push(err instanceof Error ? err.message : String(err));
		return problems;
	}

	for (const [dirName, reason] of corpus.invalid) {
		problems.push(`.aidd/features/${dirName}/feature.json is unreadable: ${reason}`);
	}
	if (corpus.dirs.length === 0) problems.push('The template corpus holds 0 feature records.');
	else if (durableDirs(corpus).length === 0) {
		// Every record being ephemeral is the sharpest vacuity case: the filter is working, the
		// corpus is real, and the sync would still propagate nothing while reporting success.
		problems.push(
			'Every template feature record is ephemeral; there is nothing durable to sync.',
		);
	}

	validateRoadmapCoverage(corpus, problems);
	return problems;
}
