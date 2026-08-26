/**
 * Version-independent defects in the feature records an application already carries.
 *
 * The sync's pull gate answers "does this app match the template", and it can only answer honestly
 * at version parity: `.aidd/` is gitignored upstream, so there is no tagged baseline and the
 * comparison runs against a moving HEAD. Between a template bump and the app's next dance the whole
 * gate therefore skips — which is correct for content, and leaves a hole for the two defects that
 * are wrong at *every* version.
 *
 * Both checks below hold regardless of skew, so they run before the parity skip and fail hard:
 *
 *   1. A resident record that is a COPY of a template process record. Process records are never
 *      synced to any app at any version, so a copy in an app is always a leak — from a hand-run
 *      copy pass, or from a template that shipped one before this filter existed. Two such records
 *      sat in four apps for months.
 *
 *      What identifies the copy is provenance, not the name. `EPHEMERAL` answers a different
 *      question — "may the sync propagate this template record downstream" — and an application is
 *      entitled to author its own `remediation-<date>-…` finding: aidd's pipelines mint that name,
 *      and its `status-policy` exempts the name from approval parking precisely so they can.
 *      Condemning the name cost real work — `ui-redesign-planner` stopped filing UI findings on
 *      derived apps at all rather than disguise one under a slug that lied about what it was.
 *
 *      Two signals answer provenance and either is sufficient. The template corpus carrying the
 *      same directory is proof outright, and catches a leak that predates stamping. Failing that,
 *      the app copy's own `spernakit_version`: `check-template-feature-versions.ts` requires one on
 *      every record in the template and states that app-owned records legitimately carry none, so a
 *      stamp on an app's process record means it arrived from upstream. That second signal is what
 *      keeps this check working with no template checkout at all, as it must.
 *
 *      `plan.ts` warns against reading a missing stamp as app ownership. That warning is about
 *      OWNERSHIP of durable records, where a wrong answer destroys template content. Here a stamp
 *      only ever escalates to a failure and never grants ownership, and the corpus branch covers
 *      the unstamped case whenever a checkout exists. Do not restore the name-only test.
 *   2. A record whose `spernakit_version` differs from the value the template's copy carries.
 *      `spernakit_version` records the version that *introduced* a record and is never bumped on
 *      revision, so it is identical across template versions for the same directory. A difference is
 *      not staleness; it is evidence the app's copy was hand-edited.
 *
 * What deliberately is NOT here: a marked record with no counterpart directory upstream. That reads
 * as a defect at parity (the sync prunes it) but is ordinary at skew — the template may have deleted
 * the record after the version the app is on, and the app cannot act on it before upgrading. Failing
 * on it would put every app in the fleet red for the window this tier exists to cover.
 */
import type { FeatureCorpus } from './types.ts';

import { isEphemeralDir } from './source.ts';

export interface ResidentDefect {
	detail: string;
	dirName: string;
	kind: 'leaked-process-record' | 'stamp-mismatch';
}

function stampOf(corpus: FeatureCorpus, dirName: string): string | undefined {
	const value = corpus.features.get(dirName)?.['spernakit_version'];
	return typeof value === 'string' ? value : undefined;
}

/**
 * Grade an app's resident records. `template` is `null` when no template checkout was resolvable,
 * which leaves only the checks that need no counterpart.
 */
export function auditResidentRecords(
	app: FeatureCorpus,
	template: FeatureCorpus | null,
): ResidentDefect[] {
	const defects: ResidentDefect[] = [];

	for (const dirName of app.dirs) {
		if (!isEphemeralDir(dirName)) continue;
		const inTemplate = template !== null && template.dirs.includes(dirName);
		const marked = stampOf(app, dirName) !== undefined;
		// Neither signal fires: the application authored this finding itself, which it may.
		if (!inTemplate && !marked) continue;
		defects.push({
			detail: inTemplate
				? 'a copy of a template process record; these are never synced to an application'
				: 'carries spernakit_version, so it came from the template; process records never sync',
			dirName,
			kind: 'leaked-process-record',
		});
	}

	if (template !== null) {
		for (const dirName of app.dirs) {
			if (isEphemeralDir(dirName)) continue;
			const appStamp = stampOf(app, dirName);
			const templateStamp = stampOf(template, dirName);
			if (appStamp === undefined || templateStamp === undefined) continue;
			if (appStamp === templateStamp) continue;
			defects.push({
				detail: `spernakit_version is ${appStamp}, but the template records ${templateStamp}`,
				dirName,
				kind: 'stamp-mismatch',
			});
		}
	}

	return defects.sort((left, right) => left.dirName.localeCompare(right.dirName));
}

/** Print the defects and the remedy for each kind. Returns the count. */
export function printResidentDefects(appLabel: string, defects: ResidentDefect[]): number {
	if (defects.length === 0) return 0;

	console.error(`Template Feature Records (${appLabel})`);
	console.error('');
	console.error(`   ${defects.length} record(s) are wrong at any template version:`);
	for (const defect of defects) {
		console.error(`     ${defect.dirName.padEnd(44)} (${defect.detail})`);
	}
	console.error('');

	if (defects.some((defect) => defect.kind === 'leaked-process-record')) {
		console.error(
			"   These are copies of the template's own process records and belong upstream. Read",
		);
		console.error(
			'   each one, confirm its content already lives in a durable feature, then delete the',
		);
		console.error('   directory and its `.aidd/roadmap.json` entry.');
		console.error(
			'   A finding this application authored itself is not reported here, whatever it is named.',
		);
	}
	if (defects.some((defect) => defect.kind === 'stamp-mismatch')) {
		console.error(
			'   A differing `spernakit_version` means the record was hand-edited: the field marks the',
		);
		console.error(
			'   version that introduced the record and is never bumped. Restore it to the template',
		);
		console.error('   value, and move any app-specific content into an app-owned feature.');
	}
	console.error('');
	return defects.length;
}
