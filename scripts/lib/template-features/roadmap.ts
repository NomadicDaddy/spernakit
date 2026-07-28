/**
 * Merging the template's roadmap entries into an app's own `.aidd/roadmap.json`.
 *
 * The split of authority is deliberate and narrow:
 *
 *   milestones            never touched. Names are app-owned vocabulary — the template says `MVP`,
 *                         g5 says `mvp-foundation` — and renaming or adding one rewrites how the
 *                         app's own work is organised. The single exception is an app with no
 *                         roadmap at all, where the template's block is the seed.
 *   features.dependencies template-authoritative. This is the repair for the dependency edges apps
 *                         have lost: `applyRoadmap` reads its edge list from here, so a correct
 *                         roadmap makes the next apply RESTORE edges instead of erasing them.
 *   features.milestone    app-authoritative wherever the entry already exists. Only a brand-new
 *                         entry needs a milestone chosen, and it is resolved through a ladder whose
 *                         rung is reported, because guessing in bulk is a thing a human must see.
 *
 * A milestone is never invented. An entry naming a milestone the app does not define makes aidd's
 * `roadmap:apply` abort the app's ENTIRE run, so an unresolvable milestone fails the sync instead.
 */

import type {
	FeatureCorpus,
	FeaturePlanEntry,
	MilestoneRung,
	RoadmapDocument,
	RoadmapEntry,
	RoadmapMilestone,
} from './types.ts';

import { isEphemeralDir } from './source.ts';

export interface MilestoneChoice {
	milestone: string;
	rung: MilestoneRung;
}

/**
 * Map the template's milestone name onto one the app actually defines.
 *
 * exact -> the app uses the same name. priority -> exactly one app milestone sits at the template
 * milestone's priority, so the correspondence is unambiguous. current -> the app's highest-numbered
 * milestone, matching the rule bug2feature already uses for untargeted work. none -> the app defines
 * no milestones, which is not a guess the sync is allowed to make.
 */
export function resolveMilestone(
	templateMilestone: string | undefined,
	templateMilestones: Record<string, RoadmapMilestone>,
	appMilestones: Record<string, RoadmapMilestone>,
): MilestoneChoice | null {
	const appNames = Object.keys(appMilestones).sort();
	if (appNames.length === 0) return null;

	if (templateMilestone !== undefined && Object.hasOwn(appMilestones, templateMilestone)) {
		return { milestone: templateMilestone, rung: 'exact' };
	}

	const templatePriority =
		templateMilestone === undefined
			? undefined
			: templateMilestones[templateMilestone]?.priority;
	if (typeof templatePriority === 'number') {
		const matches = appNames.filter(
			(name) => appMilestones[name]?.priority === templatePriority,
		);
		const only = matches[0];
		if (matches.length === 1 && only !== undefined) {
			return { milestone: only, rung: 'priority' };
		}
	}

	// Ties resolve to the alphabetically first name purely so two runs agree with each other.
	let current = appNames[0] as string;
	for (const name of appNames) {
		const priority = appMilestones[name]?.priority ?? 0;
		if (priority > (appMilestones[current]?.priority ?? 0)) current = name;
	}
	return { milestone: current, rung: 'current' };
}

/** Template edges, minus any pointing at a process artifact — a capability never depends on one. */
function templateDependencies(templateEntry: RoadmapEntry): string[] | undefined {
	if (!Object.hasOwn(templateEntry, 'dependencies')) return undefined;
	const raw = templateEntry.dependencies;
	if (!Array.isArray(raw)) return [];
	return raw.filter((name): name is string => typeof name === 'string' && !isEphemeralDir(name));
}

export interface RoadmapMergeInput {
	app: FeatureCorpus;
	entries: FeaturePlanEntry[];
	template: FeatureCorpus;
}

export interface RoadmapMergeResult {
	changed: boolean;
	/** Milestone chosen for each roadmap entry the sync creates, with the rung it came from. */
	created: Map<string, MilestoneChoice>;
	errors: string[];
	roadmap: null | RoadmapDocument;
}

function seedRoadmap(template: RoadmapDocument, corpus: FeatureCorpus): RoadmapDocument {
	const seeded = structuredClone(template);
	seeded.features = {};
	for (const dirName of corpus.dirs) {
		if (isEphemeralDir(dirName)) continue;
		const templateEntry = template.features[dirName];
		if (templateEntry === undefined) continue;
		const dependencies = templateDependencies(templateEntry);
		seeded.features[dirName] = {
			...templateEntry,
			...(dependencies === undefined ? {} : { dependencies }),
		};
	}
	return seeded;
}

export function mergeRoadmap(input: RoadmapMergeInput): RoadmapMergeResult {
	const { app, entries, template } = input;
	const errors: string[] = [];
	const created = new Map<string, MilestoneChoice>();
	const templateRoadmap = template.roadmap;

	if (templateRoadmap === null) {
		errors.push('The template has no .aidd/roadmap.json, so synced records would be unmapped.');
		return { changed: false, created, errors, roadmap: null };
	}

	// No roadmap at all is the init case: the app has no milestone vocabulary to protect yet, so
	// the template's becomes the starting point. Every later sync merges into it instead.
	if (app.roadmap === null) {
		return {
			changed: true,
			created,
			errors,
			roadmap: seedRoadmap(templateRoadmap, template),
		};
	}

	const before = structuredClone(app.roadmap);
	const next = structuredClone(app.roadmap);

	for (const entry of entries) {
		if (entry.action === 'pruned') {
			// An entry left behind for a deleted directory is a hard error inside `roadmap:apply`.
			delete next.features[entry.dirName];
			continue;
		}
		if (entry.action === 'prune-blocked') continue;

		const templateEntry = templateRoadmap.features[entry.dirName];
		if (templateEntry === undefined) {
			errors.push(`The template roadmap has no entry for '${entry.dirName}'.`);
			continue;
		}

		const dependencies = templateDependencies(templateEntry);
		const existing = next.features[entry.dirName];
		if (existing !== undefined) {
			next.features[entry.dirName] = {
				...existing,
				...(dependencies === undefined ? {} : { dependencies }),
			};
			continue;
		}

		const choice = resolveMilestone(
			typeof templateEntry.milestone === 'string' ? templateEntry.milestone : undefined,
			templateRoadmap.milestones,
			next.milestones,
		);
		if (choice === null) {
			errors.push(
				`'${entry.dirName}' needs a milestone but the app's roadmap defines none; add at least one milestone before syncing.`,
			);
			continue;
		}
		created.set(entry.dirName, choice);
		next.features[entry.dirName] = {
			milestone: choice.milestone,
			...(dependencies === undefined ? {} : { dependencies }),
		};
	}

	return { changed: !Bun.deepEquals(before, next), created, errors, roadmap: next };
}
