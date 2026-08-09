/**
 * Cache dependencies for the toolchain qc steps: the ones that compile, lint, format, validate
 * config, or measure the produced bundle.
 *
 * Split from the project-invariant guards in `steps-checks.ts` to keep each map inside the
 * 300-line modularity gate; `dependencies.ts` merges the two into the single map the cache
 * consumes.
 */

import {
	APPLICATION_CHECK_DIRECTORY_GLOBS,
	APPLICATION_CHECK_FILE_GLOBS,
	COMMON_EXCLUDES,
	CONFIG_SCHEMA_GLOBS,
	FORMAT_GLOBS,
	GENERATED_OUTPUT_EXCLUDES,
	LINT_GLOBS,
	PACKAGE_GLOBS,
} from './globs.ts';
import { type StepDependencies } from './types.ts';

export const TOOLCHAIN_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	build: {
		directoryGlobs: APPLICATION_CHECK_DIRECTORY_GLOBS,
		excludes: [...COMMON_EXCLUDES, 'data/**'],
		globs: [
			...APPLICATION_CHECK_FILE_GLOBS,
			'frontend/src/**/*.ts',
			'frontend/src/**/*.tsx',
			'frontend/src/**/*.css',
			'frontend/index.html',
			'frontend/vite.config.ts',
			'frontend/vite-plugins/**/*.ts',
			'frontend/tsconfig.json',
			'frontend/tsconfig.app.json',
			'frontend/tsconfig.build.json',
			'frontend/package.json',
			'shared/src/**/*.ts',
			'shared/tsconfig.json',
			'shared/package.json',
			'backend/src/**/*.ts',
			'backend/tsconfig.json',
			'backend/package.json',
			...PACKAGE_GLOBS,
		],
		outputs: ['frontend/dist'],
	},
	'config:validate': {
		excludes: COMMON_EXCLUDES,
		globs: [
			...CONFIG_SCHEMA_GLOBS,
			'scripts/lib/config-validation.ts',
			'scripts/validate-config.ts',
		],
	},
	'format:check': {
		collector: 'prettier',
		excludes: COMMON_EXCLUDES,
		globs: FORMAT_GLOBS,
	},
	lint: {
		excludes: COMMON_EXCLUDES,
		globs: LINT_GLOBS,
	},
	// The inner loop's ESLint-cached variant. Same dependency set as `lint`, deliberately a separate
	// cache entry: a fast pass must never satisfy the full gate's uncached lint.
	'lint:fast': {
		excludes: COMMON_EXCLUDES,
		globs: LINT_GLOBS,
	},
	'test:config-preflight': {
		excludes: COMMON_EXCLUDES,
		globs: [
			...CONFIG_SCHEMA_GLOBS,
			'scripts/lib/config-validation.ts',
			'scripts/lib/crypto-keys.ts',
			'scripts/smoke.json',
			'scripts/test-config-preflight.ts',
			'scripts/validate-config.ts',
		],
	},
	'test:destructive-comments': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/check-destructive-confirmation.ts',
			'scripts/lib/destructive/comments.ts',
			'scripts/lib/destructive/evidence.ts',
			'scripts/lib/destructive/waivers.ts',
			'scripts/test-destructive-comments.ts',
		],
	},
	'test:destructive-evidence': {
		excludes: COMMON_EXCLUDES,
		globs: ['scripts/lib/destructive/evidence.ts', 'scripts/test-destructive-evidence.ts'],
	},
	'test:mutation-denylist': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/services/database-admin/schemaIntrospection.ts',
			'backend/src/services/database-admin/dataValidation.ts',
			'scripts/test-mutation-denylist.ts',
		],
	},
	'test:reset-packages': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/reset-packages.ts',
			'scripts/smoke.json',
			'scripts/test-reset-packages.ts',
		],
	},
	// Replaces the retired `licenses:sync-core:check` entry, which was cacheable for a reason that
	// was wrong: every glob it listed was spernakit-side, so drift introduced in one of the four
	// sibling repositories changed none of them and the step replayed a cached pass over a fleet it
	// had not looked at. What is cacheable here is the self-test, whose whole world is this tree;
	// the fleet-facing half is `check:shared-core`, which is uncacheable for that same reason.
	'test:shared-core-write': {
		excludes: COMMON_EXCLUDES,
		globs: ['scripts/lib/shared-core/**/*.ts', 'scripts/test-shared-core-write.ts'],
	},
	typecheck: {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/**/*.ts',
			'backend/package.json',
			'backend/tsconfig.json',
			'frontend/src/**/*.ts',
			'frontend/src/**/*.tsx',
			'frontend/package.json',
			'frontend/tsconfig.json',
			'frontend/tsconfig.app.json',
			'frontend/tsconfig.node.json',
			'frontend/tsconfig.build.json',
			'shared/src/**/*.ts',
			'shared/package.json',
			'shared/tsconfig.json',
			'scripts/**/*.ts',
			'scripts/tsconfig.json',
			'package.json',
			'bun.lock',
		],
	},
	'verify-minification': {
		excludes: GENERATED_OUTPUT_EXCLUDES,
		globs: [
			'frontend/dist/**/*',
			'scripts/bundle-budget.json',
			'scripts/lib/bundle-budget.ts',
			'scripts/load-json-config.ts',
			'scripts/verify-minification.ts',
		],
		outputs: ['frontend/dist'],
	},
};
