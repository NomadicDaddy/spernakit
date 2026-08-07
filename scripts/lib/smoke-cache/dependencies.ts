/**
 * Step dependency configurations for the smoke test cache.
 *
 * Maps each QC step to the file globs, exclusions, and outputs that determine
 * whether the step can be skipped on an unchanged tree.
 *
 * The map itself lives in cohesive modules for project-invariant guards, feature-integration
 * checks, and compile/format/build steps because a single literal outgrew the 300-line modularity
 * gate. This module is the facade the cache and the smoke runner consume.
 */

import { CHECK_STEP_DEPENDENCIES } from './steps-checks.ts';
import { INTEGRATION_STEP_DEPENDENCIES } from './steps-integration.ts';
import { METADATA_STEP_DEPENDENCIES } from './steps-metadata.ts';
import { TOOLCHAIN_STEP_DEPENDENCIES } from './steps-toolchain.ts';
import { type StepDependencies } from './types.ts';

export const UNCACHEABLE_STEPS = new Set([
	'check:drift',
	'check:fleet-manifest',
	'check:fresh-release',
	// Its inputs are up to 32 sibling checkouts, not this tree. Hashing this repository's files
	// answers "did the owner change", never "did a target drift" — and a target drifting is the only
	// thing it checks. A cached pass here would be the presence-over-content failure it exists to
	// catch, reproduced in the gate itself.
	'check:shared-core',
	// Its inputs are the sibling spernakit checkout's `.aidd/`, not this tree — the same reason
	// `check:drift` cannot be cached. A local hash would report "unchanged" across a template bump.
	'check:template-features',
	'test:aidd-format',
	'test:fleet-manifest',
]);

export const STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	...CHECK_STEP_DEPENDENCIES,
	...INTEGRATION_STEP_DEPENDENCIES,
	...METADATA_STEP_DEPENDENCIES,
	...TOOLCHAIN_STEP_DEPENDENCIES,
};

export function isCacheableStep(step: string): boolean {
	return step in STEP_DEPENDENCIES;
}

export function isKnownSmokeCacheStep(step: string): boolean {
	return isCacheableStep(step) || UNCACHEABLE_STEPS.has(step);
}
