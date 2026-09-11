/**
 * Step dependency configurations for the smoke test cache.
 *
 * Maps each QC step to the file globs, exclusions, and outputs that determine
 * whether the step can be skipped on an unchanged tree.
 *
 * The map itself lives in cohesive modules for project-invariant guards, feature-integration
 * checks, application regression gates split by whether the gate drives the server, the page, or
 * a workspace, and compile/format/build steps, because a single literal outgrew the 300-line
 * modularity gate. This module is the facade the cache and the smoke runner consume.
 */

import { CHECK_STEP_DEPENDENCIES } from './steps-checks.ts';
import { INTEGRATION_STEP_DEPENDENCIES } from './steps-integration.ts';
import { METADATA_STEP_DEPENDENCIES } from './steps-metadata.ts';
import { BROWSER_REGRESSION_STEP_DEPENDENCIES } from './steps-regressions-browser.ts';
import { WORKSPACE_REGRESSION_STEP_DEPENDENCIES } from './steps-regressions-workspace.ts';
import { REGRESSION_STEP_DEPENDENCIES } from './steps-regressions.ts';
import { SELF_TEST_STEP_DEPENDENCIES } from './steps-selftests.ts';
import { TOOLCHAIN_STEP_DEPENDENCIES } from './steps-toolchain.ts';
import { type StepDependencies } from './types.ts';

export const UNCACHEABLE_STEPS = new Set([
	// It reads `.aidd/audit-reports/`, and `/.aidd/` is gitignored here. Every input is untracked, so
	// a hash of this tree answers "did a tracked file change" while a report appears, changes, or is
	// removed without moving that hash at all. Its other input is the wall clock, which no glob can
	// name.
	'check:audit-artifact-hygiene',
	'check:drift',
	'check:fleet-manifest',
	'check:fresh-release',
	// Its inputs are up to 32 sibling checkouts, not this tree. Hashing this repository's files
	// answers "did the owner change", never "did a target drift" — and a target drifting is the only
	// thing it checks. A cached pass here would be the presence-over-content failure it exists to
	// catch, reproduced in the gate itself.
	'check:shared-core',
	// Half its input is a git tag in the sibling template checkout, which no local glob can name.
	// The comparison itself is pinned to the app's own declared version and a published tag is never
	// moved, so a cached pass over unchanged files would usually still be true. What breaks it is the
	// skip path: an app whose template tag is not fetched yet skips and exits 0, the cache records
	// that as a pass, and the finding stays hidden after the tag arrives even though nothing in the
	// app changed. That is the silent short runbook this gate exists to catch, so it always runs.
	// In spernakit itself it skips immediately and costs nothing.
	'check:smoke-steps',
	// Its inputs are the sibling spernakit checkout's `.aidd/`, not this tree — the same reason
	// `check:drift` cannot be cached. A local hash would report "unchanged" across a template bump.
	'check:template-features',
	'test:aidd-format',
	'test:fleet-manifest',
]);

export const STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	...BROWSER_REGRESSION_STEP_DEPENDENCIES,
	...CHECK_STEP_DEPENDENCIES,
	...INTEGRATION_STEP_DEPENDENCIES,
	...METADATA_STEP_DEPENDENCIES,
	...REGRESSION_STEP_DEPENDENCIES,
	...SELF_TEST_STEP_DEPENDENCIES,
	...TOOLCHAIN_STEP_DEPENDENCIES,
	...WORKSPACE_REGRESSION_STEP_DEPENDENCIES,
};

export function isCacheableStep(step: string): boolean {
	return step in STEP_DEPENDENCIES;
}

export function isKnownSmokeCacheStep(step: string): boolean {
	return isCacheableStep(step) || UNCACHEABLE_STEPS.has(step);
}
