#!/usr/bin/env bun
/**
 * Thin delegate to `sync-shared-core.ts --group license-core`.
 *
 * This script used to hold its own copy of everything: the seven-file list, the roster loader, the
 * uncommitted-changes refusal, the absent-sibling skip. All four now live in the shared-core
 * manifest and library, where three more groups share them. What is left here is the entry point,
 * kept working rather than deleted because `licenses:sync-core` is in muscle memory, in
 * `docs/template/`, and in this repository's own history.
 *
 * THE OWNERSHIP GUARD STAYS HERE, AHEAD OF THE DELEGATION. This file ships to derived apps via
 * template sync, and a run from one of them would otherwise make a copy the source of truth and
 * overwrite every adopter from it. `sync-shared-core.ts` enforces the same rule per group and would
 * refuse anyway, but it is deliberately not shipped to derived apps at all (see classify.ts), so in
 * an app this delegate would fail with "script not found" instead of the explanation below. A guard
 * that only works where the file cannot run is not a guard.
 *
 * Retire this once nothing in the fleet calls it. The roster it reads is now
 * `shared-core-targets.json`; the old `license-core-targets.json` name went with the generalization.
 */
import { resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

import { isSpernakitItself } from './lib/template/repo.ts';

const root = resolve(cwd());

if (!isSpernakitItself(root)) {
	console.error('Refusing to run: Spernakit is the source of truth for license core.');
	console.error(`Run this from the Spernakit repository, not ${root}.`);
	exit(1);
}

// --check maps to --check; everything else means "do the sync". That second reading is the one
// defect of the original this delegate cannot fix without changing what callers get, and it is
// exactly why sync-shared-core.ts rejects unknown arguments instead: an argument this script does
// not recognize, --help included, has always fallen through to the write path. Callers that want
// argument checking should invoke sync-shared-core.ts directly.
const mode = argv.slice(2).includes('--check') ? '--check' : '--write';

console.log(`licenses:sync-core is now sync-shared-core.ts --group license-core ${mode}.`);

const result = Bun.spawnSync(
	['bun', resolve(root, 'scripts/sync-shared-core.ts'), mode, '--group', 'license-core'],
	{ cwd: root, stderr: 'inherit', stdout: 'inherit', windowsHide: true },
);

exit(result.exitCode ?? 1);
