#!/usr/bin/env bun
/**
 * Regression test for the drift check's shared-core exclusion.
 *
 * The guard hooks reach derived apps through the shared-core sync, and check:shared-core holds them
 * to the owner's current copy. The drift check used to compare the same files to the release an app
 * is pinned to, so every guard update between releases failed every derived app (2026-10-09). This
 * pins both halves: the three files that failed are governed, and ordinary template files are not,
 * so the exclusion cannot quietly swallow real drift. It also pins that only the comparison is
 * excluded: a governed file the app is missing still fails the drift check.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { driftCheckedFiles, sharedCoreGovernedPaths } from './lib/template/shared-core-governed.ts';

const scriptsDir = join(import.meta.dir);
const templateMode = existsSync(join(scriptsDir, 'shared-core-manifest.json'));
const governed = await sharedCoreGovernedPaths(scriptsDir);
const failures: string[] = [];

if (templateMode) {
	for (const path of [
		'.githooks/leak-guard.sh',
		'.githooks/pre-push',
		'scripts/check-leak-guard.sh',
	]) {
		if (!governed.has(path)) failures.push(`${path} should be governed by shared-core`);
	}
} else {
	// A derived app ships this self-test but no shared-core: the local manifest is absent, the
	// guard returns an empty governed set, and nothing is excluded from comparison locally
	// (governance for an app's drift run is read from the template it checks against). An empty
	// set here is the app-mode contract, not a silent swallow (Roger 88317845).
	if (governed.size !== 0) {
		failures.push(
			'an app has no local shared-core manifest, so the governed set must be empty',
		);
	}
}
// Template files, and a roster group's file (license core reaches derived apps via the template).
for (const path of [
	'backend/src/app.ts',
	'package.json',
	'scripts/check-template-drift.ts',
	'scripts/check-license-core.ts',
]) {
	if (governed.has(path))
		failures.push(`${path} is template-managed and must stay drift-checked`);
}
for (const path of governed) {
	if (path.startsWith('/') || path.startsWith('./') || path.includes('\\')) {
		failures.push(`${path} is not a normalized app-relative path`);
	}
}

// Only the content comparison is handed off. A governed file the app lacks must still reach
// checkFile, where it fails as missing-in-app; shared-core reports absence as advisory only.
// The fixture uses a SYNTHETIC governed set, not the tree's real one: in template mode the real
// set works, but in a derived app it is legitimately empty (no local manifest), and the point
// here is the handoff behavior itself, not which files this tree governs (Morticia #16566).
const appRoot = mkdtempSync(join(tmpdir(), 'drift-governed-'));
try {
	mkdirSync(join(appRoot, '.githooks'));
	writeFileSync(join(appRoot, '.githooks', 'pre-push'), '#!/bin/sh\n');
	const fixtureGoverned = new Set(['.githooks/pre-push']);
	const checked = driftCheckedFiles(
		['.githooks/pre-push', '.githooks/leak-guard.sh', 'backend/src/app.ts'],
		fixtureGoverned,
		appRoot,
	);
	if (checked.includes('.githooks/pre-push')) {
		failures.push('.githooks/pre-push is present, so its comparison belongs to shared-core');
	}
	if (!checked.includes('.githooks/leak-guard.sh')) {
		failures.push('.githooks/leak-guard.sh is missing and must still fail as missing-in-app');
	}
	if (!checked.includes('backend/src/app.ts')) {
		failures.push('backend/src/app.ts is template-managed and must stay drift-checked');
	}
	// The same handoff with an empty governed set (a derived app's local reality): nothing is
	// excluded, so every enumerated path - including a present .githooks/pre-push - stays checked.
	const checkedUngoverned = driftCheckedFiles(
		['.githooks/pre-push', 'backend/src/app.ts'],
		new Set<string>(),
		appRoot,
	);
	if (
		!checkedUngoverned.includes('.githooks/pre-push') ||
		!checkedUngoverned.includes('backend/src/app.ts')
	) {
		failures.push('with no governed paths (an app), every enumerated path must stay checked');
	}
} finally {
	rmSync(appRoot, { force: true, recursive: true });
}

if (failures.length > 0) {
	console.error('[FAIL] shared-core drift exclusion:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	`[OK] shared-core drift exclusion: ${governed.size} governed path(s), template files still checked.`,
);
