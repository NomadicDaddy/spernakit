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
	'check:feature-id-directory': {
		dot: true,
		excludes: AIDD_METADATA_EXCLUDES,
		globs: ['.aidd/features/*/feature.json', 'scripts/check-feature-id-directory.ts'],
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
	// The self-test builds its own corpus, so `.aidd` is not an input — only the sync's own code is.
	'test:template-features': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'.prettierrc',
			'scripts/check-feature-id-directory.ts',
			'scripts/check-template-feature-versions.ts',
			'scripts/lib/template-features/*.ts',
			'scripts/sync-template-features.ts',
			'scripts/test-template-features.ts',
		],
	},
};
