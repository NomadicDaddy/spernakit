#!/usr/bin/env bun
/**
 * Regression test for the audit that finds app-authored lines a template upgrade deleted.
 *
 * The bug this guards is silent by construction. During the 2026-07-27 upgrade round one derived app
 * lost twenty lines and nine commits of navigation entries and every gate stayed green, because a
 * dropped nav entry typechecks, lints, builds and serves. Another lost an app-added field from a
 * shared API type and was caught only because one page happened to consume it. Nothing in the gate
 * chain asks the question, so nothing in the gate chain can answer it.
 *
 * The assertions therefore drive the shipped CLI against real git repositories rather than the line
 * arithmetic alone, because the verdict is a function of three histories at once: the template's, the
 * app's, and the audited commit's own diff. The fixture harness lives in
 * `lib/template/lost-lines-fixture.ts` and builds an app with two alternative upgrade commits from
 * the same parent — one that lost app work and one that did not — so every failing assertion has a
 * control that must pass.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

import {
	APP_ONLY,
	APP_ONLY_LINE,
	createLostLinesFixture,
	FEATURE_SUBJECT,
	INIT_ONLY_LINE,
	LOST_NAV_LINE,
	LOST_SCAFFOLD_LINE,
	NAV,
	REFLOWED_APP_LINE,
	ROUTES,
	SCAFFOLD,
	SYNC_ONLY_LINE,
	SYNC_SUBJECT,
	SYNCED,
	TEMPLATE_OWNED_LINE,
	UNTOUCHED,
} from './lib/template/lost-lines-fixture.ts';
import {
	collectTemplateLines,
	isTemplateManagedPath,
	isTemplateSyncSubject,
} from './lib/template/lost-lines.ts';
import { findRemovedLines, normalizeLine } from './lib/template/text.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const fixture = createLostLinesFixture(join(import.meta.dir, '..'));

try {
	// ===== 1. THE REGRESSION. The upgrade dropped app work from two template-managed paths. =====
	const lost = fixture.run([]);
	assert(lost.exitCode !== 0, `An upgrade that dropped app work must fail:\n${lost.output}`);
	assert(
		lost.output.includes(NAV) && lost.output.includes(LOST_NAV_LINE),
		`The report must name the path and the line that was lost:\n${lost.output}`,
	);
	assert(
		lost.output.includes('LOST APP LINES (2 files)'),
		`The report must count the affected files:\n${lost.output}`,
	);

	// ===== 2. Each finding carries the post-init commits that make the path app work. =====
	// The commit list is the evidence for the verdict, not decoration: it is what an operator reads
	// to decide whether to restore the line or drop it deliberately.
	assert(
		lost.output.includes(FEATURE_SUBJECT),
		`Each finding must print the app commits that touched the path:\n${lost.output}`,
	);
	assert(
		lost.output.includes('1 removed line no template revision had'),
		`A finding must say how many lines it found and on what grounds:\n${lost.output}`,
	);

	// ===== 3. Scaffold-mapped history is resolved through toTemplatePath. =====
	// `.prettierignore` lives at `scaffolding/.prettierignore` in the template. Without the mapping
	// the path has no template revisions at all and the finding is silently dropped.
	assert(
		lost.output.includes(SCAFFOLD) && lost.output.includes(LOST_SCAFFOLD_LINE),
		`A scaffold-mapped file must be audited against its scaffolding/ history:\n${lost.output}`,
	);
	assert(
		!lost.output.includes('scaffolding/'),
		'Findings must be reported at the app path, not at the template path',
	);

	// ===== 4. A line the template once shipped is replacement, not loss. =====
	// TEMPLATE_OWNED_LINE was dropped by the same commit, from the same file as LOST_NAV_LINE. It is
	// only distinguishable by the template's OWN history: v9.0.0 had it, v9.1.0 does not. Replacing
	// it is the entire point of the upgrade.
	assert(
		!lost.output.includes(TEMPLATE_OWNED_LINE),
		`A removed line an older template revision shipped must not be reported:\n${lost.output}`,
	);

	// ===== 5. The trailing-comma reflow does not manufacture findings. =====
	// The app's own route line survives the upgrade and only gains a comma. No template revision ever
	// contained it, so without normalization it is a false positive with every other test passing.
	assert(
		!lost.output.includes(ROUTES) && !lost.output.includes(REFLOWED_APP_LINE),
		`A surviving app line reflowed by trailingComma: all must not be reported:\n${lost.output}`,
	);

	// ===== 6. A path with no app commit after init carries template content, not app work. =====
	// `untouched.ts` loses a line no surviving template revision has — apps seeded before v3.28.2 are
	// full of them, because those tags were squashed away. Only the absence of a later app commit on
	// the path keeps it quiet.
	assert(
		!lost.output.includes(UNTOUCHED) && !lost.output.includes(INIT_ONLY_LINE),
		`A path untouched since init must not be reported as app work:\n${lost.output}`,
	);

	// ===== 7. A path an EARLIER template sync touched is not app work either. =====
	// `synced.ts` loses a line no tagged template revision has, written into the app by an untagged
	// template fix. `docs/template/CHANGELOG.md` is the real case: the trim from a full
	// history to the last five releases reads as 2209 lost lines, because the pre-3.28.2 squash took
	// the blobs that would prove otherwise. Only the touching commit's subject settles it.
	assert(
		!lost.output.includes(SYNCED) && !lost.output.includes(SYNC_ONLY_LINE),
		`A path touched only by an earlier template sync must not be reported:\n${lost.output}`,
	);

	// ===== 8. A path no template revision has is out of scope. =====
	// The copy pass cannot have written a file the template does not ship, so a line removed from one
	// is an ordinary app edit riding along in the same commit.
	assert(
		!lost.output.includes(APP_ONLY) && !lost.output.includes(APP_ONLY_LINE),
		`A path the template never had must not be audited as upgrade loss:\n${lost.output}`,
	);

	// ===== 9. --rev defaults to HEAD. =====
	const explicit = fixture.run(['--rev', fixture.upgradeRev]);
	assert(
		explicit.exitCode === lost.exitCode && explicit.output.includes(LOST_NAV_LINE),
		`--rev <HEAD commit> must produce the same verdict as the default:\n${explicit.output}`,
	);

	// ===== 10. THE CONTROL. The same upgrade done right passes. =====
	// Same parent, same template delta, app work preserved. Without this the failures above could all
	// come from an audit that reports every upgrade commit it is handed.
	const repaired = fixture.run(['--rev', fixture.repairedRev]);
	assert(
		repaired.exitCode === 0,
		`An upgrade that preserved app work must exit 0:\n${repaired.output}`,
	);
	assert(
		repaired.output.includes('No app-authored lines lost'),
		`A clean audit must say so explicitly:\n${repaired.output}`,
	);
	assert(
		!repaired.output.includes('LOST APP LINES'),
		'A clean audit must not print the failing banner',
	);

	// ===== 11. The commit that ADDED the app work is clean too. =====
	// Nothing before it is app work — only `init` and a template sync — so no path it touches has a
	// qualifying history yet. An audit that flagged it would fire on every ordinary feature commit.
	const feature = fixture.run(['--rev', fixture.featureRev]);
	assert(
		feature.exitCode === 0,
		`A commit that only added app lines must exit 0:\n${feature.output}`,
	);

	// ===== 12. Argument handling fails loudly rather than auditing the wrong thing. =====
	const noAppDir = fixture.runRaw([]);
	assert(
		noAppDir.exitCode !== 0 && noAppDir.output.includes('--app-dir is required'),
		`A missing --app-dir must be rejected:\n${noAppDir.output}`,
	);
	const emptyAppDir = fixture.runRaw(['--app-dir']);
	assert(
		emptyAppDir.exitCode !== 0 && emptyAppDir.output.includes('--app-dir requires a value'),
		`--app-dir without a value must be rejected:\n${emptyAppDir.output}`,
	);
	// A subdirectory of the template repo: a real directory, but not a repository root. Rejected
	// before any template resolution, so no audit is ever performed against the wrong history.
	const notARepo = fixture.runRaw(['--app-dir', join(fixture.templateDir, 'backend')]);
	assert(
		notARepo.exitCode !== 0 && notARepo.output.includes('not a git repository'),
		`An --app-dir that is not a repository root must be rejected:\n${notARepo.output}`,
	);
	const badRev = fixture.run(['--rev', 'no-such-commit']);
	assert(
		badRev.exitCode !== 0 && badRev.output.includes('could not resolve --rev'),
		`An unresolvable --rev must be reported, not audited as empty:\n${badRev.output}`,
	);
	const emptyRev = fixture.run(['--rev']);
	assert(
		emptyRev.exitCode !== 0 && emptyRev.output.includes('--rev requires a value'),
		`--rev without a value must be rejected:\n${emptyRev.output}`,
	);

	// ===== 13. Unit behavior the CLI fixture cannot isolate. =====
	// Exactly one trailing comma is stripped, and only from the end: a comma inside the line is
	// content, and `foo,,` losing one comma is still a changed line.
	assert(
		normalizeLine('\tfoo,') === '\tfoo' && normalizeLine('foo  \t') === 'foo',
		'normalizeLine must strip one trailing comma and trailing whitespace',
	);
	assert(
		normalizeLine('foo,,') === 'foo,' && normalizeLine('a, b') === 'a, b',
		'normalizeLine must not strip commas that are content',
	);
	// The finding prints what the file actually had, so the operator can grep for it.
	assert(
		findRemovedLines('a,\nb\n', 'b\n')[0] === 'a,',
		'A reported line must be displayed as the file had it, not as it was normalized',
	);
	assert(
		findRemovedLines('a,\n', 'a\n').length === 0,
		'A line that only gained or lost a trailing comma is not a removal',
	);
	// Membership is against the whole file, not the diff hunk: an upgrade that reorders a file
	// removes and re-adds most of it.
	assert(
		findRemovedLines('a\nb\n', 'b\na\n').length === 0,
		'A line the upgrade only moved is not a removal',
	);
	assert(
		findRemovedLines('a\n\n\na\n', 'b\n').length === 1,
		'Blank lines carry no evidence and duplicates collapse to one finding',
	);
	assert(
		isTemplateManagedPath(SCAFFOLD) && isTemplateManagedPath(NAV),
		'Scaffold-mapped and ordinary template paths are both audited',
	);
	assert(
		!isTemplateManagedPath('scripts/lib/fleet/manifest.ts') &&
			!isTemplateManagedPath('data/x.ts'),
		'Paths the template never copies into an app are not audited',
	);
	// Both fleet conventions, and the message DEVELOPMENT.md prescribes.
	assert(
		isTemplateSyncSubject(SYNC_SUBJECT) &&
			isTemplateSyncSubject('chore(template): upgrade to Spernakit v3.31.2') &&
			isTemplateSyncSubject('chore: sync spernakit template to v3.31.2'),
		'Every template-sync commit convention must be recognized as a template copy',
	);
	assert(
		!isTemplateSyncSubject(FEATURE_SUBJECT) &&
			!isTemplateSyncSubject('chore(deps): update dependencies') &&
			!isTemplateSyncSubject('chore: sync the seed fixtures'),
		'Ordinary app commits must not be mistaken for template copies',
	);
	// The classifier reads EVERY revision, not the tip: TEMPLATE_OWNED_LINE exists only in v9.0.0,
	// and it is precisely the line assertion 4 depends on suppressing.
	const navHistory = collectTemplateLines(fixture.templateDir, NAV);
	assert(
		navHistory?.has(TEMPLATE_OWNED_LINE) === true &&
			!navHistory.has(normalizeLine(LOST_NAV_LINE)),
		'collectTemplateLines must read every revision of the path, not just the tip',
	);
	const scaffoldHistory = collectTemplateLines(fixture.templateDir, `scaffolding/${SCAFFOLD}`);
	assert(
		scaffoldHistory?.has('dist/') === true && scaffoldHistory.has('build/'),
		'collectTemplateLines must union the lines of every revision',
	);
	assert(
		collectTemplateLines(fixture.templateDir, APP_ONLY) === null,
		'A path with no template revision must be reported as out of scope, not as empty',
	);

	console.log(`Lost app lines audit test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
