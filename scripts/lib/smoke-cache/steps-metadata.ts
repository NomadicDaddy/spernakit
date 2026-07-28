/**
 * Cache dependencies for checks that grade `.aidd` feature metadata.
 *
 * Hidden-directory collection must be explicit: Bun.Glob otherwise skips every `.aidd` input and
 * gives a metadata guard a constant hash.
 */

import { AIDD_METADATA_EXCLUDES, COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const METADATA_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	'check:aidd-format': {
		// `.gitignore` decides whether the format check runs or takes its template skip branch.
		dot: true,
		excludes: AIDD_METADATA_EXCLUDES,
		globs: [
			'.aidd/features/*/feature.json',
			'.aidd/roadmap.json',
			'.gitignore',
			'.prettierrc',
			'scripts/aidd-prettierignore',
			'scripts/check-aidd-format.ts',
		],
	},
	'check:template-feature-versions': {
		dot: true,
		excludes: AIDD_METADATA_EXCLUDES,
		globs: [
			'.aidd/features/*/feature.json',
			'package.json',
			'scripts/check-template-feature-versions.ts',
		],
	},
	'test:template-feature-versions': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/check-template-feature-versions.ts',
			'scripts/test-template-feature-versions.ts',
		],
	},
};
