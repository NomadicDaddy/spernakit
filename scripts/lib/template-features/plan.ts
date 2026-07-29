/**
 * The pure planner: given two loaded corpora, decide what each app directory should become.
 *
 * Nothing here touches the filesystem, so every classification rule is testable in isolation and the
 * CLI's `--check` mode and its write mode grade the identical plan.
 *
 * Ownership is decided by the TEMPLATE corpus, not by whether the app copy carries a
 * `spernakit_version`. Getting that backwards looks defensible and is not: five template features
 * were copied into apps before they were stamped upstream, so reading a missing marker as "the app
 * owns this" would declare a conflict on records the app never authored. The marker is evidence
 * about how a copy arrived, which is what separates `updated` from `adopted` — not authority.
 */
import { isEphemeralDir } from './source.ts';
import {
	AUTHORED_FIELDS,
	type FeatureCorpus,
	type FeaturePlanEntry,
	type FeatureRecord,
	SEEDED_FIELDS,
	type SyncAction,
	TEMPLATE_OWNED_FIELDS,
} from './types.ts';

/**
 * Fields stored inconsistently as a string or an array of lines, in both directions: the template
 * holds `crawltest-build-mode-verification.notes` as a string while all four populated apps hold an
 * array, and `custom-dashboard-page` is the reverse. Specs additionally store literal `\n` rather
 * than real newlines in some records. Comparing them raw reports around thirty differences that are
 * pure serialization, and each one would trigger a rewrite that changes nothing.
 */
const NORMALIZED_FIELDS = new Set<string>(['notes', 'spec']);

function splitLines(value: string): string[] {
	return value
		.split(/\r?\n|\\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

function normalizeField(field: string, value: unknown): unknown {
	if (!NORMALIZED_FIELDS.has(field)) return value;
	if (typeof value === 'string') return splitLines(value);
	if (Array.isArray(value)) {
		return value.flatMap((entry) => (typeof entry === 'string' ? splitLines(entry) : [entry]));
	}
	return value;
}

/**
 * Template-owned fields whose value differs, comparing normalized. A field present on one side and
 * absent on the other counts: the sync deletes fields the template dropped.
 */
export function changedTemplateFields(template: FeatureRecord, app: FeatureRecord): string[] {
	const changed: string[] = [];
	for (const field of TEMPLATE_OWNED_FIELDS) {
		const inTemplate = Object.hasOwn(template, field);
		const inApp = Object.hasOwn(app, field);
		if (!inTemplate && !inApp) continue;
		if (inTemplate !== inApp) {
			changed.push(field);
			continue;
		}
		const left = normalizeField(field, template[field]);
		const right = normalizeField(field, app[field]);
		if (!Bun.deepEquals(left, right)) changed.push(field);
	}
	return changed;
}

/**
 * Produce the record to write.
 *
 * On an existing copy every app-local field survives untouched — including `updatedAt`, which is why
 * a sync that changes nothing else leaves the file byte-identical and the operation is idempotent.
 * On a new copy only template-owned fields plus the two seeds land: per-run state such as
 * `justFinishedAt` or `approval` describes a run that happened in the template and means nothing
 * downstream, and `shippedVersion` is the app's own release marker, so a fresh record has none.
 */
export function mergeRecord(template: FeatureRecord, app: FeatureRecord | null): FeatureRecord {
	const merged: FeatureRecord = app === null ? {} : { ...app };
	for (const field of TEMPLATE_OWNED_FIELDS) {
		if (Object.hasOwn(template, field)) merged[field] = template[field];
		else delete merged[field];
	}
	if (app === null) {
		for (const field of SEEDED_FIELDS) {
			if (Object.hasOwn(template, field)) merged[field] = template[field];
		}
	}
	return merged;
}

function isMarked(record: FeatureRecord): boolean {
	return typeof record['spernakit_version'] === 'string';
}

function entry(
	dirName: string,
	action: SyncAction,
	merged: FeatureRecord | null,
	changedFields: string[] = [],
	reason?: string,
): FeaturePlanEntry {
	return {
		action,
		changedFields,
		dirName,
		lossFields: changedFields.filter((field) =>
			(AUTHORED_FIELDS as readonly string[]).includes(field),
		),
		merged,
		...(reason === undefined ? {} : { reason }),
	};
}

function planExisting(
	dirName: string,
	templateRecord: FeatureRecord,
	appRecord: FeatureRecord,
	adopt: boolean,
): FeaturePlanEntry {
	const changed = changedTemplateFields(templateRecord, appRecord);
	const merged = mergeRecord(templateRecord, appRecord);

	if (isMarked(appRecord)) {
		return changed.length === 0
			? entry(dirName, 'unchanged', null)
			: entry(dirName, 'updated', merged, changed);
	}

	// An unmarked copy of a template directory. The template owns the directory either way, so the
	// only question is whether adopting it silently discards authored app text.
	const loss = changed.filter((field) => (AUTHORED_FIELDS as readonly string[]).includes(field));
	if (loss.length === 0) return entry(dirName, 'adopted', merged, changed);
	return adopt
		? entry(dirName, 'adopted-with-loss', merged, changed)
		: entry(
				dirName,
				'adopted-with-loss',
				null,
				changed,
				'refused without --adopt: adopting would erase app-authored text',
			);
}

function planPrunes(
	template: FeatureCorpus,
	app: FeatureCorpus,
	prune: boolean,
): FeaturePlanEntry[] {
	const entries: FeaturePlanEntry[] = [];
	// Syncing the template onto itself would read its own unfolded findings as leaked copies and
	// offer to delete them. The CLI refuses that pairing already; refusing it here too means no
	// caller can reach the destructive branch by accident.
	if (template.root === app.root) return entries;

	for (const dirName of app.dirs) {
		const appRecord = app.features.get(dirName);
		// An unmarked directory is app-owned by construction: nothing ever claimed it for the
		// template, so the sync has no standing to delete it.
		if (appRecord === undefined || !isMarked(appRecord)) continue;
		if (template.features.has(dirName) && !isEphemeralDir(dirName)) continue;
		if (!prune) continue;

		if (app.featureOnlyDirs.has(dirName)) {
			entries.push(
				entry(
					dirName,
					'pruned',
					null,
					[],
					isEphemeralDir(dirName)
						? 'a template process artifact that leaked downstream'
						: 'the template no longer ships this record',
				),
			);
			continue;
		}
		entries.push(
			entry(
				dirName,
				'prune-blocked',
				null,
				[],
				'directory holds files besides feature.json; delete it by hand after reviewing them',
			),
		);
	}
	return entries;
}

export interface FeaturePlanInput {
	/** Permit `adopted-with-loss` writes. Without it they are reported and refused. */
	adopt: boolean;
	app: FeatureCorpus;
	prune: boolean;
	template: FeatureCorpus;
}

/** Feature-record entries only; `roadmap.ts` merges the roadmap over the same directory sets. */
export function planFeatures(input: FeaturePlanInput): FeaturePlanEntry[] {
	const { adopt, app, prune, template } = input;
	const entries: FeaturePlanEntry[] = [];

	for (const dirName of template.dirs) {
		if (isEphemeralDir(dirName)) continue;
		const templateRecord = template.features.get(dirName);
		if (templateRecord === undefined) continue;

		const appRecord = app.features.get(dirName);
		entries.push(
			appRecord === undefined
				? entry(dirName, 'added', mergeRecord(templateRecord, null))
				: planExisting(dirName, templateRecord, appRecord, adopt),
		);
	}

	entries.push(...planPrunes(template, app, prune));
	entries.sort((left, right) => left.dirName.localeCompare(right.dirName));
	return entries;
}
