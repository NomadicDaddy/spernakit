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
	// Signs in through the real login route and reads the log back through the real listing, so
	// its world is the audit writer and reader, the field allowlist they share, and everything the
	// two requests pass through on the way.
	'test:audit-outcome-filter': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/**',
			'backend/src/db/seed/**',
			'backend/src/plugins/**',
			'backend/src/routes/audit.ts',
			'backend/src/routes/auth/**',
			'backend/src/services/auditService.ts',
			'backend/src/services/authService.ts',
			'backend/src/utils/fieldSelection.ts',
			'scripts/test-audit-outcome-filter.ts',
		],
	},
	// Asserts the lifecycle stage authorization runs at, so its world is the plugins that carry the
	// guards and the limiter, the error handler that turns their throw back into a response, the one
	// representative route it exercises, and every route file it scans for a guard that has gone
	// back to beforeHandle.
	'test:auth-before-validation': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/create-api-app.ts',
			'backend/src/db/seed/**',
			'backend/src/guards/**',
			'backend/src/plugins/**',
			'backend/src/routes/**',
			'backend/src/utils/errorResponse.ts',
			'backend/src/utils/preValidationRejection.ts',
			'scripts/lib/auth-ordering.ts',
			'scripts/test-auth-before-validation.ts',
		],
	},
	// Submits through the real route against a temp database, so its world is the intake route and
	// the service behind it, the plugins those requests pass through, the seed that supplies the
	// account, and the table the report lands in.
	'test:bug-report-whitespace': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/bugReports.ts',
			'backend/src/db/seed/**',
			'backend/src/plugins/**',
			'backend/src/routes/bugs.ts',
			'backend/src/services/bugReportService.ts',
			'scripts/test-bug-report-whitespace.ts',
		],
	},
	// The fixture is self-contained: it copies clear-logs.ts into a temp tree and writes its own
	// runbook there, so the real scripts/smoke.json is not part of this step's world.
	'test:clear-logs': {
		excludes: COMMON_EXCLUDES,
		globs: ['scripts/clear-logs.ts', 'scripts/test-clear-logs.ts'],
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
	// Imports the frontend page tree in process and renders it, so its world is most of
	// frontend/src rather than a named handful of files: the query client, the API client the
	// page fetches through, the page and its child components, and the app slug the source tree
	// reads at import time.
	'test:dashboard-not-found': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/defaults.json',
			'frontend/src/**',
			'scripts/lib/frontend-render.ts',
			'scripts/test-dashboard-not-found.ts',
		],
	},
	'test:dashboard-share-revoke': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/**',
			'backend/src/guards/**',
			'backend/src/plugins/**',
			'backend/src/routes/dashboards/**',
			'backend/src/services/dashboard/**',
			'scripts/test-dashboard-share-revoke.ts',
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
	// Spawns a probe through the real spawn-background wiring and reads the log files back, so
	// its world is the logger and the configuration it reads, the spawn helpers, and the probe.
	'test:error-log-wiring': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/**',
			'backend/src/utils/logger.ts',
			'config/**',
			'scripts/lib/process/**',
			'scripts/test-error-log-wiring.ts',
		],
	},
	// Runs in-process against a temp SQLite file (like `test:retention-zero`), so its world is the
	// backend source plus the migrations it applies; a change anywhere in backend/src re-runs it.
	'test:impersonation-audit': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-impersonation-audit.ts'],
	},
	'test:mutation-denylist': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/services/database-admin/schemaIntrospection.ts',
			'backend/src/services/database-admin/dataValidation.ts',
			'scripts/test-mutation-denylist.ts',
		],
	},
	// Drives the real API in process against a temp database, so its world is the dashboard
	// routes and services it calls, the plugins and guards those routes stack, and the schema.
	// Seeds through the real seed path and reads the checklist over the real API, so its world is
	// the onboarding service and route, the accounts and settings the seed writes, the password
	// writers it drives, and the guard those requests pass through.
	'test:onboarding-password-step': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/db/schema/**',
			'backend/src/db/seed/**',
			'backend/src/plugins/**',
			'backend/src/routes/onboarding.ts',
			'backend/src/services/auth/**',
			'backend/src/services/onboardingService.ts',
			'backend/src/services/user/userPasswordAdminService.ts',
			'backend/src/utils/auth/**',
			'scripts/test-onboarding-password-step.ts',
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
	// Same in-process temp-DB shape as `test:impersonation-audit` above.
	'test:retention-zero': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-retention-zero.ts'],
	},
	'test:secrets-file': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/configSecretsFile.ts',
			'backend/src/config/configUtils.ts',
			'config/*.secrets.json.example',
			'scripts/test-secrets-file.ts',
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
	// Runs in process against the loaded configuration: what it asserts moves when the file
	// validation service, the request-body ceiling, or the configured MIME allowlist and size
	// limits move, so the config tree is part of its world alongside the backend source.
	'test:upload-validation': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/src/**', 'config/**', 'scripts/test-upload-validation.ts'],
	},
	// Same in-process temp-DB shape as `test:impersonation-audit`: it applies the migrations and
	// exercises the guard module, so its world is the backend source plus the gate script itself.
	'test:workspace-role-predicate': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-workspace-role-predicate.ts'],
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
