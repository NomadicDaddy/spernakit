/**
 * Composition root for the feature sync: load both corpora, plan the records, merge the roadmap.
 *
 * Kept separate from `plan.ts` so that file stays free of filesystem access and testable as pure
 * functions, and separate from the CLI so the CLI holds argument handling and skip policy only.
 */

import type { SyncPlan } from './types.ts';

import { planFeatures } from './plan.ts';
import { mergeRoadmap, type MilestoneChoice } from './roadmap.ts';
import { durableDirs, loadCorpus } from './source.ts';

export interface SyncPlanOptions {
	adopt: boolean;
	prune: boolean;
}

export interface SyncOutcome {
	/** Milestone chosen for each roadmap entry the sync would create. */
	created: Map<string, MilestoneChoice>;
	/** Durable records in the template corpus — the denominator the report is read against. */
	durable: number;
	plan: SyncPlan;
}

export function buildSyncPlan(
	templateRoot: string,
	appRoot: string,
	options: SyncPlanOptions,
): SyncOutcome {
	const template = loadCorpus(templateRoot);
	const app = loadCorpus(appRoot);

	const entries = planFeatures({
		adopt: options.adopt,
		app,
		prune: options.prune,
		template,
	});
	const merge = mergeRoadmap({ app, entries, template });

	const errors = [...merge.errors];
	// An app record that will not parse is reported rather than silently treated as absent, which
	// is what the planner would otherwise do — and that path overwrites it without ever reading it.
	for (const [dirName, reason] of app.invalid) {
		errors.push(`.aidd/features/${dirName}/feature.json is unreadable: ${reason}`);
	}

	return {
		created: merge.created,
		durable: durableDirs(template).length,
		plan: {
			entries,
			errors,
			roadmap: merge.roadmap,
			roadmapChanged: merge.changed,
		},
	};
}
