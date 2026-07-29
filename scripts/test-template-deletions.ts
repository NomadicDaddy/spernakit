#!/usr/bin/env bun
/**
 * Regression test for detecting files the TEMPLATE removed but a derived app still carries.
 *
 * The drift checker only ever asked "does the app match what the template ships?". When the
 * template removes a file, that path stops being enumerated, so the app carrying it looks clean —
 * no drift, no missing file, nothing to fix. `backend/src/routes/auth/mfa-rate-limit.ts` rode three
 * derived apps from their init commits to v3.31.2 in exactly that blind spot and was found by hand.
 *
 * These assertions drive the shipped CLI against real git tags rather than the detector function
 * alone, because the blind spot was never in the set arithmetic — it was in the fact that nothing
 * ever performed it. A unit test of `detectRetainedDeletions` would have passed on the day the bug
 * shipped. The fixture harness lives in `lib/template/deletions-fixture.ts`.
 *
 * The fixture app is byte-identical to the template at its recorded version, so ordinary drift is
 * zero and every non-zero exit below is attributable to the deletion check alone. Assertion 8 makes
 * that baseline non-vacuous by proving drift still fails on its own.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

import {
	APP_ONLY_FILE,
	createDeletionFixture,
	KEPT_FILE,
	REMOVED_FILE,
	REMOVED_SCAFFOLD,
} from './lib/template/deletions-fixture.ts';
import { detectRetainedDeletions, findRemovedPaths } from './lib/template/deletions.ts';
import { type TemplateOverrides } from './lib/template/types.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const noOverrides = (): TemplateOverrides => ({
	deleted: new Map(),
	keep: new Map(),
	skip: new Map(),
});

const fixture = createDeletionFixture(join(import.meta.dir, '..'));

try {
	// ===== 1. Without --target-version, behavior is unchanged: a clean app still passes. =====
	const baseline = fixture.runDrift([]);
	assert(
		baseline.exitCode === 0,
		`A clean app must still pass without --target-version:\n${baseline.output}`,
	);
	assert(
		!baseline.output.includes('REMOVED FROM TEMPLATE'),
		'The deletion check must not run unless --target-version is given',
	);

	// ===== 2. THE REGRESSION. The target tag dropped two files the app still carries. =====
	const detected = fixture.runDrift(['--target-version', '9.1.0']);
	assert(detected.exitCode !== 0, `A retained deletion must fail the gate:\n${detected.output}`);
	assert(
		detected.output.includes(REMOVED_FILE),
		`The failure must name the retained file:\n${detected.output}`,
	);
	assert(
		detected.output.includes('REMOVED FROM TEMPLATE'),
		'Retained deletions must be reported under their own banner, not as drift or missing files',
	);
	assert(
		detected.output.includes('v9.0.0') && detected.output.includes('v9.1.0'),
		'The report must name both compared versions so the operator can see the window',
	);
	assert(
		detected.output.includes('No template drift detected'),
		'Ordinary drift must be zero here, or the exit code proves nothing about deletions',
	);

	// ===== 3. Scaffold-mapped paths are compared through toTemplatePath, in both directions. =====
	assert(
		detected.output.includes(REMOVED_SCAFFOLD),
		`A removed scaffold-mapped file must be reported under its APP path:\n${detected.output}`,
	);
	assert(
		!detected.output.includes('scaffolding/'),
		'Removed scaffold files must be named where the app has them, not at their template path',
	);
	// .gitignore survives at both tags, but ONLY as scaffolding/.gitignore — never at the app path.
	// A raw tree comparison would call it deleted at every version. This is the assertion that fails
	// if toTemplatePath is dropped from the still-shipped test.
	assert(
		!detected.output.includes('.gitignore'),
		`A scaffold-mapped file the target still ships must not be reported:\n${detected.output}`,
	);

	// ===== 4. App-authored files are never candidates. =====
	assert(
		!detected.output.includes(APP_ONLY_FILE),
		'A file at a path no compared tag ever shipped must not be reported as a template deletion',
	);
	assert(
		!detected.output.includes(KEPT_FILE),
		'A file the target version still ships must not be reported',
	);

	// ===== 5. A DELETED override suppresses the retention and prints its reason. =====
	fixture.write(
		'.templateoverrides',
		[
			'# Retained deliberately',
			`DELETED ${REMOVED_FILE} # still called by the legacy admin route`,
			`DELETED ${REMOVED_SCAFFOLD} # app formats dist/ on purpose`,
			'',
		].join('\n'),
	);
	const suppressed = fixture.runDrift(['--target-version', '9.1.0']);
	assert(
		suppressed.exitCode === 0,
		`A DELETED override must suppress the retained path:\n${suppressed.output}`,
	);
	assert(
		suppressed.output.includes('still called by the legacy admin route'),
		`The suppressed entry must print its recorded reason:\n${suppressed.output}`,
	);
	assert(
		suppressed.output.includes('[DELETED]'),
		'The suppressed entry must name the override action that suppressed it',
	);
	assert(
		!suppressed.output.includes('REMOVED FROM TEMPLATE'),
		'A fully suppressed run must not print the failing banner',
	);

	// ===== 6. A removed path the app EDITED is still a deletion, not drift. =====
	// Judged against the recorded version this file is 'drifted', and that label prescribes
	// restoring the template baseline — for a file the target has deleted. The deletion report has
	// to win, or the operator is sent to reconcile a file they are about to remove.
	fixture.remove('.templateoverrides');
	fixture.write(REMOVED_FILE, 'export const mfaRateLimit = 999; // locally patched\n');
	const edited = fixture.runDrift(['--target-version', '9.1.0']);
	assert(
		edited.exitCode !== 0 && edited.output.includes('REMOVED FROM TEMPLATE'),
		`An edited copy of a removed file must be reported as a deletion:\n${edited.output}`,
	);
	assert(
		edited.output.includes('No template drift detected'),
		`A removed path must not also be reported as drift:\n${edited.output}`,
	);

	// ===== 7. Once the app deletes the files, it is clean again — the check has an exit. =====
	fixture.remove(REMOVED_FILE);
	fixture.remove(REMOVED_SCAFFOLD);
	const resolved = fixture.runDrift(['--target-version', '9.1.0']);
	assert(
		resolved.exitCode === 0,
		`An app that dropped the removed files must pass with no override:\n${resolved.output}`,
	);
	assert(
		resolved.output.includes('No files retained from removed template paths'),
		'A clean deletion check must say so explicitly',
	);
	assert(
		!resolved.output.includes(REMOVED_FILE),
		'A file the app already dropped must not be reported — there is nothing to tell it',
	);
	// The same tree WITHOUT a target version is still legitimately missing two files: the app has
	// not moved off v9.0.0, which does ship them. Suppression is scoped to the comparison that
	// justifies it, and is not a permanent hole in the missing-file check.
	const withoutTarget = fixture.runDrift([]);
	assert(
		withoutTarget.exitCode !== 0 && withoutTarget.output.includes('Missing files'),
		`Deleting a file must still be missing against the recorded version:\n${withoutTarget.output}`,
	);
	fixture.restore(REMOVED_FILE);
	fixture.restore(REMOVED_SCAFFOLD, 'scaffolding/.prettierignore');

	// ===== 8. NEGATIVE CONTROL: ordinary drift still fails on its own. =====
	// Without this, assertions 1/5/6 could all pass because the checker silently stopped checking.
	fixture.write(KEPT_FILE, 'export const keep = false;\n');
	const drifted = fixture.runDrift([]);
	assert(
		drifted.exitCode !== 0 && drifted.output.includes(KEPT_FILE),
		`Ordinary drift must still fail independently of the deletion check:\n${drifted.output}`,
	);
	fixture.restore(KEPT_FILE);

	// ===== 9. A mistyped target tag fails; it must never exit 0. =====
	// The caller typed this version, so an unresolvable one is their error, not an unmet environmental
	// precondition. It matters because the check aborts the whole run: were this a skip, one typo
	// would exit 0 while also withholding the ordinary drift verdict, in the workflow where drift
	// matters most. Asserted with DRIFT_REQUIRED unset, since that is the case a skip would hide.
	const missingTag = fixture.runDrift(['--target-version', '99.0.0']);
	assert(
		missingTag.exitCode !== 0 && missingTag.output.includes('99.0.0'),
		`An unknown target tag must fail and name the version, not skip:\n${missingTag.output}`,
	);
	assert(
		!missingTag.output.includes('SKIPPED'),
		`An unknown target tag must not report itself as skipped:\n${missingTag.output}`,
	);
	const requiredSkip = fixture.runDrift(['--target-version', '99.0.0'], { DRIFT_REQUIRED: '1' });
	assert(
		requiredSkip.exitCode !== 0,
		'DRIFT_REQUIRED=1 must also reject an unresolvable target tag',
	);
	const noValue = fixture.runDrift(['--target-version']);
	assert(
		noValue.exitCode !== 0 && noValue.output.includes('--target-version requires a version'),
		`--target-version without a value must be rejected, not silently ignored:\n${noValue.output}`,
	);

	// ===== 10. Detector unit behavior the CLI fixture cannot isolate. =====
	// findRemovedPaths is the set the drift report is filtered by, so it must include a removed path
	// the app has ALREADY dropped — otherwise deleting the file would resurrect it as a missing-file
	// failure, which is exactly the contradiction assertion 7 guards end-to-end.
	const removedRegardless = findRemovedPaths({
		recordedPaths: ['gone.ts', 'kept.ts'],
		targetPaths: ['kept.ts'],
	});
	assert(
		removedRegardless.has('gone.ts') && !removedRegardless.has('kept.ts'),
		'findRemovedPaths must classify by the two template versions alone, not by app contents',
	);
	assert(
		detectRetainedDeletions({
			existsInApp: () => false,
			overrides: noOverrides(),
			recordedPaths: ['gone.ts'],
			targetPaths: [],
		}).length === 0,
		'A removed path the app no longer carries must not be reported',
	);
	// Duplicate candidates collapse, and output is deterministically ordered.
	const ordered = detectRetainedDeletions({
		existsInApp: () => true,
		overrides: noOverrides(),
		recordedPaths: ['b.ts', 'a.ts', 'b.ts'],
		targetPaths: [],
	});
	assert(
		ordered.length === 2 && ordered[0]?.filePath === 'a.ts',
		'Deletions must be de-duplicated and sorted for a stable report',
	);
	// An empty DELETED reason is still a suppression — the operator acknowledged the path.
	const emptyReason = detectRetainedDeletions({
		existsInApp: () => true,
		overrides: { ...noOverrides(), deleted: new Map([['a.ts', '']]) },
		recordedPaths: ['a.ts'],
		targetPaths: [],
	});
	assert(
		emptyReason[0]?.status === 'suppressed',
		'A DELETED line with no reason must still suppress the retention',
	);

	console.log(`Template deletion detection test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
