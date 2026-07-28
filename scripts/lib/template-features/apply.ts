/**
 * Writing a plan to disk.
 *
 * Every write goes through `formatJsonFor`, so a synced app is left in the shape its own
 * `check:aidd-format` gate demands rather than in whatever shape this process happened to produce.
 * The plan is applied whole or not at all: callers validate and report first, and only reach here
 * with a plan that has no errors.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RoadmapDocument, SyncPlan } from './types.ts';

import { formatJsonFor } from './format.ts';

export interface ApplyOptions {
	/**
	 * Write records whose overwrite destroys app-authored `spec`/`notes`/`description`/`summary`.
	 *
	 * Off by default. Reporting the loss and then performing it in the same breath is not a warning,
	 * it is a notification of a deletion that already happened — and the four populated apps carry
	 * 29-33 such records each, so the default has to be the one that keeps them.
	 */
	overwriteAppText: boolean;
}

export interface ApplyResult {
	/** Directories left untouched because writing them would have destroyed app-authored text. */
	blocked: string[];
	/** Feature directories deleted. */
	removed: string[];
	roadmapWritten: boolean;
	/** Feature directories whose `feature.json` was rewritten or created. */
	written: string[];
}

/** True when overwriting this entry would destroy text no other copy of the app records. */
export function destroysAppText(entry: SyncPlan['entries'][number]): boolean {
	return entry.action === 'updated' && entry.lossFields.length > 0;
}

export async function applyPlan(
	appRoot: string,
	plan: SyncPlan,
	options: ApplyOptions = { overwriteAppText: false },
): Promise<ApplyResult> {
	const featuresRoot = join(appRoot, '.aidd', 'features');
	const result: ApplyResult = { blocked: [], removed: [], roadmapWritten: false, written: [] };

	for (const entry of plan.entries) {
		if (entry.action === 'pruned') {
			await rm(join(featuresRoot, entry.dirName), { force: true, recursive: true });
			result.removed.push(entry.dirName);
			continue;
		}
		if (!options.overwriteAppText && destroysAppText(entry)) {
			result.blocked.push(entry.dirName);
			continue;
		}
		// `unchanged`, `prune-blocked` and a refused adoption all carry a null record, which is the
		// single signal that nothing should be written for that directory.
		if (entry.merged === null) continue;

		const destPath = join(featuresRoot, entry.dirName, 'feature.json');
		await mkdir(join(featuresRoot, entry.dirName), { recursive: true });
		await writeFile(destPath, await formatJsonFor(destPath, entry.merged), 'utf8');
		result.written.push(entry.dirName);
	}

	if (plan.roadmapChanged && plan.roadmap !== null) {
		await writeRoadmap(appRoot, plan.roadmap);
		result.roadmapWritten = true;
	}

	return result;
}

export async function writeRoadmap(appRoot: string, roadmap: RoadmapDocument): Promise<void> {
	const destPath = join(appRoot, '.aidd', 'roadmap.json');
	await mkdir(join(appRoot, '.aidd'), { recursive: true });
	await writeFile(destPath, await formatJsonFor(destPath, roadmap), 'utf8');
}
