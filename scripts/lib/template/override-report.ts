/**
 * Human-readable reporting for the override-delta check.
 *
 * Kept out of `check-override-deltas.ts` so the entry script stays under the 300-line gate, and
 * out of `report.ts` because it answers a different question: `report.ts` renders how an app differs
 * from the template, this renders what an accepted override is keeping the app from receiving.
 *
 * Every entry prints its `.templateoverrides` reason next to its delta. That pairing is the point of
 * the report — during the 2026-07-27 dance the reasons were accurate about what the app had ADDED
 * and silent about what it had stopped receiving, and reading them beside the withheld lines is what
 * made the difference visible.
 */
import type { OverrideDelta } from './override-deltas.ts';

export interface OverrideDeltaCounts {
	deltas: number;
	empty: number;
	unavailable: number;
}

/** Trailing tag for one entry heading: its action, classification, and security relevance. */
function tags(entry: OverrideDelta): string {
	const parts: string[] = [entry.action, entry.category];
	if (entry.security) parts.push('SECURITY');
	return `[${parts.join(' ')}]`;
}

function printReason(entry: OverrideDelta): void {
	console.log(`        reason: ${entry.reason === '' ? '(none recorded)' : entry.reason}`);
}

/** One withholding entry: heading, recorded reason, the withheld lines, and local additions. */
function printDelta(entry: OverrideDelta, targetVersion: string): void {
	const count = entry.withheld.length;
	console.log(`     ${entry.appPath} ${tags(entry)}`);
	printReason(entry);
	if (entry.templatePath !== entry.appPath) {
		console.log(`        compared against: ${entry.templatePath}`);
	}
	console.log(
		`        ${count} line${count === 1 ? '' : 's'} v${targetVersion} has and this app does not:`,
	);
	for (const line of entry.withheld) console.log(`           ${line}`);
	if (entry.appOnly.length > 0) {
		const added = entry.appOnly.length;
		console.log(
			`        (the app copy also has ${added} line${added === 1 ? '' : 's'} the target does not)`,
		);
	}
	console.log('');
}

/**
 * Render the report and return what it found.
 *
 * The caller owns the exit code: a withheld delta is advisory unless `--fail-on-delta` is given,
 * while an unresolved entry always fails. Counting here and deciding there keeps the two rules in
 * one place each.
 */
export function printOverrideDeltas(
	entries: OverrideDelta[],
	targetVersion: string,
): OverrideDeltaCounts {
	const deltas = entries.filter((e) => e.status === 'delta');
	const empty = entries.filter((e) => e.status === 'empty');
	const presence = entries.filter((e) => e.status === 'presence');
	const unavailable = entries.filter((e) => e.status === 'unavailable');

	console.log(`Override Delta Report (.templateoverrides vs spernakit v${targetVersion})`);
	console.log('');

	if (entries.length === 0) {
		console.log('   No .templateoverrides entries — nothing is being held back.');
		console.log('');
		return { deltas: 0, empty: 0, unavailable: 0 };
	}

	if (deltas.length > 0) {
		console.log(
			`   WITHHELD BY OVERRIDE (${deltas.length} entr${deltas.length === 1 ? 'y' : 'ies'}):`,
		);
		console.log('');
		for (const entry of deltas) printDelta(entry, targetVersion);
		console.log(
			'     Re-merge each line, or rewrite the reason to say why the app rejects it.',
		);
		console.log('');
	}

	// An override that withholds nothing has outlived whatever it was written for: the app and the
	// target agree on the file's content, so the only thing the line still does is hide future
	// changes to it.
	if (empty.length > 0) {
		console.log(`   WITHHOLDING NOTHING (${empty.length}, safe to delete):`);
		for (const entry of empty) {
			console.log(`     ${entry.appPath} ${tags(entry)}`);
			printReason(entry);
		}
		console.log(
			`     These entries match v${targetVersion} line for line; deleting them restores`,
		);
		console.log('     drift detection on the path at no cost.');
		console.log('');
	}

	if (presence.length > 0) {
		console.log(`   PRESENCE OVERRIDES (${presence.length}, DELETED — not compared):`);
		for (const entry of presence) {
			console.log(`     ${entry.appPath}${entry.reason === '' ? '' : ` — ${entry.reason}`}`);
		}
		console.log('     A DELETED line declares an absence, so there is no app copy to compare.');
		console.log('');
	}

	// Fail closed: an entry whose comparison could not be made is not evidence of a clean override,
	// and reporting it as one would be exactly the silence this check exists to remove.
	if (unavailable.length > 0) {
		console.log(`   UNRESOLVED (${unavailable.length}, FAILING):`);
		for (const entry of unavailable) {
			console.log(`     ${entry.appPath} ${tags(entry)} — ${entry.unavailable}`);
			printReason(entry);
		}
		console.log('     Delete the stale entry, or convert it to DELETED if the absence is');
		console.log('     deliberate. An entry that cannot be compared is not a clean entry.');
		console.log('');
	}

	if (deltas.length === 0 && unavailable.length === 0) {
		console.log(`   No override is withholding template content at v${targetVersion}.`);
		console.log('');
	}

	return { deltas: deltas.length, empty: empty.length, unavailable: unavailable.length };
}
