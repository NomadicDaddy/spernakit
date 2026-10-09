#!/usr/bin/env bun
/**
 * Regression test for the drift check's shared-core exclusion.
 *
 * The guard hooks reach derived apps through the shared-core sync, and check:shared-core holds them
 * to the owner's current copy. The drift check used to compare the same files to the release an app
 * is pinned to, so every guard update between releases failed every derived app (2026-10-09). This
 * pins both halves: the three files that failed are governed, and ordinary template files are not,
 * so the exclusion cannot quietly swallow real drift.
 */
import { join } from 'node:path';
import { exit } from 'node:process';

import { sharedCoreGovernedPaths } from './lib/template/shared-core-governed.ts';

const governed = sharedCoreGovernedPaths(join(import.meta.dir));
const failures: string[] = [];

for (const path of [
	'.githooks/leak-guard.sh',
	'.githooks/pre-push',
	'scripts/check-leak-guard.sh',
]) {
	if (!governed.has(path)) failures.push(`${path} should be governed by shared-core`);
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

if (failures.length > 0) {
	console.error('[FAIL] shared-core drift exclusion:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	`[OK] shared-core drift exclusion: ${governed.size} governed path(s), template files still checked.`,
);
