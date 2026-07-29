/**
 * Shared vocabulary for the template feature-record sync.
 *
 * A feature record is `.aidd/features/<dir>/feature.json`. The template authors them; derived apps
 * carry copies. Which fields the template owns and which belong to the app is the whole contract, so
 * it lives here as an explicit allowlist rather than as a "everything except…" rule: aidd adds
 * runtime fields to these records over time, and a sync built on exclusion would clobber each new
 * one the day it appeared.
 */

/**
 * Fields the template authors. Synced verbatim, and DELETED from the app copy when the template
 * record does not carry them — otherwise a field the template dropped would live forever downstream.
 */
export const TEMPLATE_OWNED_FIELDS = [
	'affectedFiles',
	'category',
	'createdAt',
	'dependencies',
	'description',
	'id',
	'notes',
	'passes',
	'spec',
	'spernakit_version',
	'status',
	'summary',
	'title',
] as const;

/**
 * The subset of template-owned fields that hold authored prose rather than structure.
 *
 * A diff here is the one the operator has to act on: it means someone wrote text into an app copy
 * that the template never received, and the sync is about to erase it. Structural fields
 * (`dependencies`, `passes`, `status`) are machine-maintained and overwriting them is the point.
 */
export const AUTHORED_FIELDS = ['description', 'notes', 'spec', 'summary'] as const;

/**
 * Every field NOT in `TEMPLATE_OWNED_FIELDS` is app-local and preserved verbatim on an existing
 * copy. These three are named because a new copy has to decide about them explicitly:
 *
 *   priority        seeded from the template; `roadmap:apply` corrects it from the app's milestone.
 *   updatedAt       seeded from the template, then never written again — it is pure churn, and
 *                   stamping it on every sync would make every app look drifted for no change.
 *   shippedVersion  the app's own release version. Never seeded; preserved when already present.
 *
 * Per-run state (`justFinishedAt`, `approval`, `blockingContext`, `escalatedFrom`, …) is neither
 * owned nor seeded: it describes a run that happened in one repository and means nothing in another.
 */
export const SEEDED_FIELDS = ['priority', 'updatedAt'] as const;

export type SyncAction =
	| 'added'
	| 'adopted-with-loss'
	| 'adopted'
	| 'prune-blocked'
	| 'pruned'
	| 'unchanged'
	| 'updated';

/** Actions that mean the app is not yet in sync, and so fail `--check`. */
export const ACTIONABLE: readonly SyncAction[] = [
	'added',
	'adopted',
	'adopted-with-loss',
	'prune-blocked',
	'pruned',
	'updated',
];

export type FeatureRecord = Record<string, unknown>;

export interface RoadmapEntry extends Record<string, unknown> {
	dependencies?: string[];
	milestone?: string;
}

export interface RoadmapMilestone extends Record<string, unknown> {
	description?: string;
	priority?: number;
}

export interface RoadmapDocument extends Record<string, unknown> {
	features: Record<string, RoadmapEntry>;
	milestones: Record<string, RoadmapMilestone>;
}

export interface FeatureCorpus {
	/** Directory names holding a readable `feature.json`, sorted. */
	dirs: string[];
	/** Directories whose only content is `feature.json` — the ones a prune may safely delete. */
	featureOnlyDirs: Set<string>;
	features: Map<string, FeatureRecord>;
	/** Parse failures, keyed by directory. A corpus with any of these is not fit to sync from. */
	invalid: Map<string, string>;
	roadmap: null | RoadmapDocument;
	root: string;
}

/**
 * How a new roadmap entry's milestone was resolved against the app's own milestone names.
 *
 * Milestone names are app-owned (`MVP` here, `mvp-foundation` there), so the template's name is a
 * hint, not an instruction. The rung is reported per entry because `current` in bulk means the app's
 * milestone mapping needs a human before the roadmap is trusted.
 */
export type MilestoneRung = 'current' | 'exact' | 'none' | 'priority';

export interface FeaturePlanEntry {
	action: SyncAction;
	/** Template-owned fields whose value differs from the app copy. Empty for `added`/`pruned`. */
	changedFields: string[];
	dirName: string;
	/** `changedFields` restricted to `AUTHORED_FIELDS` — the app text this sync would erase. */
	lossFields: string[];
	/** The record to write. `null` for `pruned`, `prune-blocked` and `unchanged`. */
	merged: FeatureRecord | null;
	/** Milestone chosen for a NEW roadmap entry; absent when the entry already existed. */
	milestone?: string;
	milestoneRung?: MilestoneRung;
	/** Why a prune was refused, or any other one-line qualifier for the action. */
	reason?: string;
}

export interface SyncPlan {
	entries: FeaturePlanEntry[];
	/** Conditions that make the plan unusable — never partially applied. */
	errors: string[];
	/** The app roadmap as it should be written, or `null` when the app has none to merge into. */
	roadmap: null | RoadmapDocument;
	roadmapChanged: boolean;
}
