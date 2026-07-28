/**
 * Step dependency configurations for the smoke test cache.
 *
 * Maps each QC step to the file globs, exclusions, and outputs that determine
 * whether the step can be skipped on an unchanged tree.
 *
 * The map itself lives in two cohesive halves — project-invariant guards in `steps-checks.ts`,
 * compile/format/build steps in `steps-toolchain.ts` — because a single literal outgrew the
 * 300-line modularity gate. This module is the facade the cache and the smoke runner consume.
 */

import { CHECK_STEP_DEPENDENCIES } from './steps-checks.ts';
import { TOOLCHAIN_STEP_DEPENDENCIES } from './steps-toolchain.ts';
import { type StepDependencies } from './types.ts';

export const UNCACHEABLE_STEPS = new Set([
	'check:drift',
	'check:fleet-manifest',
	'check:fresh-release',
	'test:aidd-format',
	'test:fleet-manifest',
]);

export const STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	...CHECK_STEP_DEPENDENCIES,
	...TOOLCHAIN_STEP_DEPENDENCIES,
};

export function isCacheableStep(step: string): boolean {
	return step in STEP_DEPENDENCIES;
}

export function isKnownSmokeCacheStep(step: string): boolean {
	return isCacheableStep(step) || UNCACHEABLE_STEPS.has(step);
}
