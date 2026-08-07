/**
 * Human-readable reporting for the feature sync, modelled on `lib/template/report.ts`.
 *
 * `printSyncReport` returns the count of entries that mean the app is not in sync, which is what
 * `--check` exits on. Nothing here writes; a report is produced identically in check mode and in
 * write mode so the two can never describe different plans.
 *
 * `emitJsonPlan` is the same report for a machine, and `countActionable` is the number both of them
 * exit on — shared rather than recomputed, so `--json` and the printed report can never disagree
 * about whether an app is in sync.
 */
import { basename } from 'node:path';

import type { MilestoneChoice } from './roadmap.ts';
import type { SyncOutcome } from './sync.ts';

import { ACTIONABLE, type FeaturePlanEntry, type SyncAction, type SyncPlan } from './types.ts';

const ORDER: readonly SyncAction[] = [
	'added',
	'updated',
	'adopted',
	'adopted-with-loss',
	'pruned',
	'prune-blocked',
	'unchanged',
];

const HEADING: Readonly<Record<SyncAction, string>> = {
	added: 'Added (absent from the app)',
	adopted: 'Adopted (unmarked app copy, no authored text lost)',
	'adopted-with-loss': 'ADOPTED WITH LOSS (unmarked app copy carrying app-authored text)',
	'prune-blocked': 'PRUNE BLOCKED (directory holds more than feature.json)',
	pruned: 'Pruned (template no longer ships this record)',
	unchanged: 'Unchanged',
	updated: 'Updated (template-owned fields differ)',
};

const pad = (value: number, width: number): string => String(value).padStart(width);

function entryLabel(entry: FeaturePlanEntry, created: Map<string, MilestoneChoice>): string {
	const parts: string[] = [];
	if (entry.changedFields.length > 0) parts.push(entry.changedFields.join(', '));
	const choice = created.get(entry.dirName);
	if (choice !== undefined) parts.push(`milestone: ${choice.milestone} [${choice.rung}]`);
	if (entry.reason !== undefined) parts.push(entry.reason);
	return parts.join(' — ');
}

/**
 * The loss notice is printed next to the entries that cause it rather than summarised at the end.
 * Overwriting `spec` or `notes` in an app copy destroys the only record that the text ever existed,
 * and the moment the operator is looking at the list is the only moment they will read the remedy.
 */
function printLossWarning(entries: FeaturePlanEntry[]): void {
	const atRisk = entries.filter(
		(entry) =>
			entry.lossFields.length > 0 &&
			(entry.action === 'updated' || entry.action === 'adopted-with-loss'),
	);
	if (atRisk.length === 0) return;

	console.log(`   APP TEXT AT RISK (${atRisk.length} record(s)):`);
	for (const entry of atRisk) {
		console.log(`     ${entry.dirName.padEnd(44)} (${entry.lossFields.join(', ')})`);
	}
	console.log(
		'     This app carries authored text the template never received. A write run leaves',
	);
	console.log(
		'     these records alone unless `--overwrite-app-text` says otherwise. Resolve each',
	);
	console.log('     one first: backport the text to spernakit, or record the difference as an');
	console.log(
		'     app-owned feature whose notes begin `DEVIATES: <template-dir> — …` and which lists',
	);
	console.log('     that directory in its roadmap dependencies.');
	console.log('');
}

/**
 * Report the records a write run declined to overwrite. Printed after the write, because the point
 * is what the operator still owes — the rest of the plan has already been applied.
 */
export function printAppTextBlocked(blocked: string[]): void {
	console.error(`   NOT OVERWRITTEN (${blocked.length} record(s) carry app-authored text):`);
	for (const dirName of blocked) console.error(`     ${dirName}`);
	console.error(
		'     Every other entry was written. These keep failing `check:template-features`',
	);
	console.error(
		'     until the text is backported or recorded as a `DEVIATES:` app-owned feature.',
	);
	console.error('     `--overwrite-app-text` discards them in favour of the template copy.');
	console.error('');
}

/** Entries meaning the app is not in sync. The exit condition of `--check`, in either output mode. */
export function countActionable(plan: SyncPlan): number {
	return plan.entries.filter((entry) => ACTIONABLE.includes(entry.action)).length;
}

/** The machine-readable report. Same plan, same exit condition — only the rendering differs. */
/**
 * The four keys every gate in this repository puts at the head of a `--json` payload. They are
 * built by the caller rather than derived here so the gate's own source states its envelope.
 */
export interface JsonEnvelope {
	examined: number;
	findings: number;
	gate: string;
	status: 'fail' | 'pass';
}

export function emitJsonPlan(appRoot: string, outcome: SyncOutcome, envelope: JsonEnvelope): void {
	console.log(
		JSON.stringify(
			{
				...envelope,
				app: basename(appRoot),
				durable: outcome.durable,
				entries: outcome.plan.entries.map((entry) => ({
					action: entry.action,
					changedFields: entry.changedFields,
					dirName: entry.dirName,
					lossFields: entry.lossFields,
					milestone: outcome.created.get(entry.dirName)?.milestone,
					milestoneRung: outcome.created.get(entry.dirName)?.rung,
					reason: entry.reason,
				})),
				errors: outcome.plan.errors,
				roadmapChanged: outcome.plan.roadmapChanged,
			},
			null,
			'\t',
		),
	);
}

export interface SyncReportOptions {
	appLabel: string;
	created: Map<string, MilestoneChoice>;
	/** Total durable directories in the template corpus, for the "considered" line. */
	durable: number;
	roadmapChanged: boolean;
}

export function printSyncReport(plan: SyncPlan, options: SyncReportOptions): number {
	console.log(`Template Feature Sync (${options.appLabel})`);
	console.log('');
	console.log(`   ${pad(options.durable, 4)} durable template records considered`);
	for (const action of ORDER) {
		const count = plan.entries.filter((entry) => entry.action === action).length;
		if (count > 0) console.log(`   ${pad(count, 4)} ${action}`);
	}
	console.log(`   roadmap.json ${options.roadmapChanged ? 'needs updating' : 'already matches'}`);
	console.log('');

	for (const action of ORDER) {
		if (action === 'unchanged') continue;
		const matching = plan.entries.filter((entry) => entry.action === action);
		if (matching.length === 0) continue;
		console.log(`   ${HEADING[action]}:`);
		for (const entry of matching) {
			const label = entryLabel(entry, options.created);
			console.log(`     ${entry.dirName.padEnd(44)}${label === '' ? '' : ` (${label})`}`);
		}
		console.log('');
	}

	printLossWarning(plan.entries);

	if (plan.errors.length > 0) {
		console.error(`   ERRORS (${plan.errors.length}), nothing was written:`);
		for (const error of plan.errors) console.error(`     ${error}`);
		console.log('');
	}

	const actionable = countActionable(plan);
	if (actionable === 0 && !options.roadmapChanged) {
		console.log('   Feature records are in sync with the template.');
	} else {
		console.log(`   ${actionable} record(s) need attention.`);
	}
	console.log('');
	return actionable;
}
