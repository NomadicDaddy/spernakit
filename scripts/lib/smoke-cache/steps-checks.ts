/**
 * Cache dependencies for the project-invariant guards: the `check-*` / `check:*` qc steps that
 * assert something about the repository rather than compiling or formatting it, plus the `test:*`
 * self-tests whose inputs are a fixed, enumerable set of source files.
 *
 * Split from the toolchain steps in `steps-toolchain.ts` to keep each map inside the 300-line
 * modularity gate; `dependencies.ts` merges the two into the single map the cache consumes.
 */

import {
	AIDD_METADATA_EXCLUDES,
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
			'scripts/check-dependency-versions.ts',
			'shared/package.json',
		],
	},
	'check-docs': {
		// check-docs recursively scans every .md file under the project root
		// (excluding the dirs listed below). A narrow glob list would let the
		// cache skip the step when an unlisted .md file gains a broken link.
		excludes: [...COMMON_EXCLUDES, '.github/**', 'coverage/**', 'data/**', 'screenshots/**'],
		globs: ['**/*.md', 'scripts/check-docs.ts'],
	},
	'check:aidd-format': {
		// The metadata is itself an input: a derived app rewrites feature.json on every iteration,
		// and the shape of what it wrote is exactly what this step grades. `.gitignore` is an input
		// too, because it decides whether the step runs at all or takes its skip branch.
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
	'check:critical-path': {
		excludes: GENERATED_OUTPUT_EXCLUDES,
		globs: [
			'frontend/dist/**/*',
			'scripts/check-critical-path.ts',
			'scripts/critical-path-budget.json',
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
			'backend/src/config/configUtils.ts',
			'frontend/src/**/*.tsx',
			'scripts/check-destructive-confirmation.ts',
		],
	},
	// check:drift has no static entry because it compares every template file from git.
	// A stale glob list once skipped real drift; missing entries intentionally always run.
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
		globs: ['.githooks/leak-guard.sh', 'package.json', 'scripts/check-leak-guard.sh'],
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
	'check:smoke-docs': {
		excludes: COMMON_EXCLUDES,
		globs: ['scripts/smoke.json', 'scripts/smoke.md', 'scripts/sync-smoke-docs.ts'],
	},
	'test:backup-compression': {
		// The branding lib is an input because the test also pins the backup HKDF info string
		// against the drift tooling's normalizer, which runs over the encryption service.
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/services/backup/backupCompressionService.ts',
			'backend/src/services/backup/backupEncryptionService.ts',
			'scripts/lib/template/*.ts',
			'scripts/test-backup-compression.ts',
		],
	},
	'test:bundle-budget': {
		// The classifier is an input because the test also pins the budget file's drift/init
		// classification, not just the budget evaluator's behavior.
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/defaults.json',
			'scripts/bundle-budget.json',
			'scripts/lib/bundle-budget.ts',
			'scripts/lib/template/classify.ts',
			'scripts/test-bundle-budget.ts',
		],
	},
	'test:crawl-credentials': {
		// The tracked config files are inputs because the test also pins them as credential-free,
		// not just the resolver's behavior.
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/defaults.json',
			'backend/src/utils/auth/passwordGenerator.ts',
			'config/example.json',
			'scripts/crawltest-config.ts',
			'scripts/test-crawl-credentials.ts',
		],
	},
};
