/**
 * Cache dependencies for the project-invariant guards: the `check-*` / `check:*` qc steps that
 * assert something about the repository rather than compiling or formatting it.
 *
 * Split from the toolchain steps in `steps-toolchain.ts`, and later from the `test:*` self-tests in
 * `steps-selftests.ts`, to keep each map inside the 300-line modularity gate; `dependencies.ts`
 * merges them into the single map the cache consumes.
 */

import {
	APPLICATION_CHECK_DIRECTORY_GLOBS,
	APPLICATION_CHECK_FILE_GLOBS,
	COMMON_EXCLUDES,
	CONFIG_JSON_GLOBS,
	CONFIG_SCHEMA_GLOBS,
	GENERATED_OUTPUT_EXCLUDES,
	SOURCE_GLOBS,
} from './globs.ts';
import { type StepDependencies } from './types.ts';

export const CHECK_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
			'scripts/check-deps.ts',
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
			'scripts/check-api-types.ts',
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
	'check:critical-path': {
		excludes: GENERATED_OUTPUT_EXCLUDES,
		globs: [
			'frontend/dist/**/*',
			'scripts/check-critical-path.ts',
			'scripts/critical-path-budget.json',
			'scripts/lib/critical-path-budget.ts',
		],
		outputs: ['frontend/dist'],
	},
	'check:db-location': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configUtils.ts',
			'backend/src/config/databaseLocation.ts',
			'backend/src/config/defaults.json',
			'config/**/*.json',
			'scripts/check-db-location.ts',
		],
	},
	'check:dead-code': {
		excludes: COMMON_EXCLUDES,
		globs: [
			...SOURCE_GLOBS,
			'scripts/**/*.ts',
			'knip.json',
			'package.json',
			'backend/package.json',
			'frontend/package.json',
			'shared/package.json',
		],
	},
	'check:destructive-confirmation': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/**/*.tsx',
			'scripts/check-destructive-confirmation.ts',
			'scripts/lib/destructive/*.ts',
		],
	},
	'check:docs': {
		// check-docs recursively scans every .md file under the project root
		// (excluding the dirs listed below). A narrow glob list would let the
		// cache skip the step when an unlisted .md file gains a broken link.
		excludes: [...COMMON_EXCLUDES, '.github/**', 'coverage/**', 'data/**', 'screenshots/**'],
		globs: ['**/*.md', 'scripts/check-docs.ts', 'scripts/lib/docs/*.ts'],
	},
	// check:drift has no static entry because it compares every template file from git.
	// A stale glob list once skipped real drift; missing entries intentionally always run.
	'check:env-spread': {
		// Same shape as check:git-window-hide: a scanner over source and scripts. `scripts/**/*.ts`
		// is the whole tree rather than the gate's own file, because a new spawn site anywhere under
		// it is exactly what the gate exists to catch, and a narrower list would cache past it.
		excludes: COMMON_EXCLUDES,
		globs: [...SOURCE_GLOBS, 'scripts/**/*.ts'],
	},
	'check:gate-conventions': {
		// Every gate's own source is an input, because the gate reads all of them. `scripts/*.ts` is
		// deliberately the whole directory rather than the current gate list: a task added to
		// package.json changes the population, and a glob list naming today's gates would let the
		// cache skip the run that would have seen the new one.
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/*.ts',
			'scripts/gate-conventions-allowlist.json',
			'scripts/lib/gate/**/*.ts',
		],
	},
	'check:git-window-hide': {
		excludes: COMMON_EXCLUDES,
		globs: [...SOURCE_GLOBS, 'scripts/**/*.ts'],
	},
	'check:image-publication': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'.github/workflows/*.yml',
			'.github/workflows/*.yaml',
			'licenses/SOURCE-OFFER.md',
			'scripts/check-image-publication.ts',
			'scripts/docker-image.ts',
		],
	},
	'check:leak-guard': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'.githooks/leak-guard.sh',
			'package.json',
			'scripts/check-leak-guard.sh',
			'scripts/run-bash.ts',
		],
	},
	'check:licenses': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'THIRD_PARTY_LICENSES.md',
			'THIRD_PARTY_NOTICES.md',
			'backend/package.json',
			'bun.lock',
			'frontend/package.json',
			'package.json',
			'scripts/check-license-core.ts',
			'scripts/generate-third-party-licenses.ts',
			'scripts/lib/license-core/**/*.ts',
			'scripts/lib/third-party-licenses/**/*.ts',
			'shared/package.json',
		],
	},
	'check:max-lines': {
		excludes: COMMON_EXCLUDES,
		globs: [...SOURCE_GLOBS, 'scripts/**/*.ts'],
	},
	'check:no-inline-references': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/**/*.ts',
			'backend/src/db/schema-pg/**/*.ts',
			'scripts/check-no-inline-references.ts',
		],
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
			'scripts/lib/schema-parity/**/*.ts',
		],
	},
	// Existence is the input here, not content: a glob set that loses a path rehashes, which is what
	// makes a deleted or renamed script invalidate the step.
	'check:script-targets': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'*/package.json',
			'eslint.config.js',
			'package.json',
			'scripts/**/*.sh',
			'scripts/**/*.ts',
		],
	},
	'check:secrets-shape': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configSecretsFile.ts',
			'backend/src/config/configUtils.ts',
			...CONFIG_JSON_GLOBS,
			'scripts/check-secrets-shape.ts',
		],
	},
	'check:smoke-docs': {
		excludes: COMMON_EXCLUDES,
		globs: ['scripts/smoke.json', 'scripts/smoke.md', 'scripts/sync-smoke-docs.ts'],
	},
	'check:version-refs': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'README.md',
			'docs/template/CHANGELOG.md',
			'docs/template/README.md',
			'package.json',
			'scripts/check-version-refs.ts',
		],
	},
};
