/**
 * Step dependency configurations for the smoke test cache.
 *
 * Maps each QC step to the file globs, exclusions, and outputs that determine
 * whether the step can be skipped on an unchanged tree.
 */

import {
	APPLICATION_CHECK_DIRECTORY_GLOBS,
	APPLICATION_CHECK_FILE_GLOBS,
	COMMON_EXCLUDES,
	CONFIG_JSON_GLOBS,
	CONFIG_SCHEMA_GLOBS,
	FORMAT_GLOBS,
	LINT_GLOBS,
	PACKAGE_GLOBS,
	SOURCE_GLOBS,
} from './globs.ts';

export interface StepDependencies {
	collector?: 'prettier';
	directoryGlobs?: string[];
	excludes: string[];
	globs: string[];
	outputs?: string[];
}

export const STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
	'check-application': {
		directoryGlobs: APPLICATION_CHECK_DIRECTORY_GLOBS,
		excludes: [...COMMON_EXCLUDES, 'data/**'],
		globs: APPLICATION_CHECK_FILE_GLOBS,
	},
	'check-deps': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/package.json',
			'frontend/package.json',
			'package.json',
			'scripts/check-dependency-versions.ts',
			'shared/package.json',
		],
	},
	'check:api-types': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/**/*.ts',
			'config/**/*.json',
			'frontend/src/api/types/**/*.ts',
			'shared/src/**/*.ts',
			'scripts/lib/api-types/**/*.ts',
			'scripts/validate-api-types.ts',
		],
	},
	'check:config': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/defaults.json',
			'package.json',
			'scripts/check-config-invariants.ts',
		],
	},
	'check:destructive-confirmation': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configUtils.ts',
			'frontend/src/**/*.tsx',
			'scripts/check-destructive-confirmation.ts',
		],
	},
	// 'check:drift' intentionally has NO entry: the drift gate compares every
	// template file enumerated from git ls-tree of the template (plus the
	// template repo's own state), which cannot be captured by a static glob
	// list — a stale list let the cache skip the step while files it didn't
	// cover had drifted. Steps without an entry always run (smoke-cache.ts
	// hashes them with Date.now()).
	'check:feature-integration': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/create-api-app.ts',
			'backend/src/routes/**/*.ts',
			'frontend/src/components/**/*.ts',
			'frontend/src/components/**/*.tsx',
			'frontend/src/pages/**/*.ts',
			'frontend/src/pages/**/*.tsx',
			'frontend/src/routes/lazyPages.ts',
			'scripts/check-feature-integration.ts',
		],
	},
	'check:lockfile-frozen': {
		excludes: COMMON_EXCLUDES,
		globs: ['bun.lock', 'scripts/check-lockfile-frozen.ts'],
	},
	'check:lts-surface': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configSecrets.ts',
			'backend/src/config/configSchema.ts',
			'docs/lts-baseline/**/*.json',
			'scripts/check-lts-surface.ts',
			'scripts/template-manifest.json',
		],
	},
	'check:max-lines': {
		excludes: COMMON_EXCLUDES,
		globs: [...SOURCE_GLOBS, 'scripts/**/*.ts'],
	},
	'check:process-env': {
		excludes: COMMON_EXCLUDES,
		globs: [...SOURCE_GLOBS, 'scripts/check-process-env.ts'],
	},
	'check:schema-drift': {
		excludes: COMMON_EXCLUDES,
		globs: [...CONFIG_SCHEMA_GLOBS, 'scripts/check-config-schema-drift.ts'],
	},
	'check:schema-parity': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/**/*.ts',
			'backend/src/db/schema-pg/**/*.ts',
			'scripts/check-schema-parity.ts',
		],
	},
	'check:secrets-shape': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configUtils.ts',
			...CONFIG_JSON_GLOBS,
			'scripts/check-secrets-shape.ts',
		],
	},
	'config:validate': {
		excludes: COMMON_EXCLUDES,
		globs: [...CONFIG_SCHEMA_GLOBS, 'scripts/validate-config.ts'],
	},
	format: {
		collector: 'prettier',
		excludes: COMMON_EXCLUDES,
		globs: FORMAT_GLOBS,
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
	'lint:fix': {
		excludes: COMMON_EXCLUDES,
		globs: LINT_GLOBS,
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
};
