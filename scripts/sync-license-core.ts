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

// No argument writes and --check checks; those are the only two things a caller has ever meant.
// Anything else is refused. The original treated every argument it did not recognize as "do the
// sync", so --help ran the fleet-wide write into every target repository. Exit 2 matches
// sync-shared-core.ts, which keeps bad arguments distinct from drift's exit 1.
const args = argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
	console.error(`Unrecognized arguments: ${args.join(' ')}`);
	console.error('Usage: bun scripts/sync-license-core.ts [--check]');
	console.error('With no argument this WRITES license core into every target repository.');
	exit(2);
}
const mode = args.length === 1 ? '--check' : '--write';

console.log(`licenses:sync-core is now sync-shared-core.ts --group license-core ${mode}.`);

const result = Bun.spawnSync(
	['bun', resolve(root, 'scripts/sync-shared-core.ts'), mode, '--group', 'license-core'],
	{ cwd: root, stderr: 'inherit', stdout: 'inherit', windowsHide: true },
);

exit(result.exitCode ?? 1);
