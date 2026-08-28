/**
 * Cache dependencies for the regression gates: the ones that drive the running application in
 * process, against a temp database or a rendered page, to prove a fixed defect stays fixed.
 *
 * Split from `steps-toolchain.ts`, which holds the steps that compile, lint, format, validate
 * config, or exercise a script in isolation. These are a different kind of world: each one's
 * dependency set is the slice of the application its request passes through, so they move when
 * the product moves rather than when the toolchain does. `dependencies.ts` merges every map into
 * the single one the cache consumes.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const REGRESSION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
	// Sets and reads the supersede link through the real routes against a temp database, so its
	// world is the bug routes and both services behind them, the migrations that add the column
	// the link lives in, the plugins those requests pass through, and the seed that supplies the
	// reporter and the administrator the two halves of the authorization rule are checked with.
	'test:bug-report-supersede': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/db/schema/bugReports.ts',
			'backend/src/db/seed/**',
			'backend/src/plugins/**',
			'backend/src/routes/bugs.helpers.ts',
			'backend/src/routes/bugs.ts',
			'backend/src/services/bug/bugSupersedeService.ts',
			'backend/src/services/bugReportService.ts',
			'scripts/lib/bug-supersede-world.ts',
			'scripts/test-bug-report-supersede.ts',
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
			'backend/src/routes/bugs.helpers.ts',
			'backend/src/routes/bugs.ts',
			'backend/src/services/bugReportService.ts',
			'scripts/test-bug-report-whitespace.ts',
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
	// Drives the real API in process against a temp database, so its world is the dashboard
	// routes and services it calls, the plugins and guards those routes stack, and the schema.
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
	// Same in-process temp-DB shape as `test:impersonation-audit` above.
	'test:retention-zero': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-retention-zero.ts'],
	},
	// Runs in process against the loaded configuration: what it asserts moves when the file
	// validation service, the request-body ceiling, or the configured MIME allowlist and size
	// limits move, so the config tree is part of its world alongside the backend source.
	'test:upload-validation': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/src/**', 'config/**', 'scripts/test-upload-validation.ts'],
	},
	// Dispatches its own navigations at the module that holds a skipped transition's promises, and
	// then reads the three files it cannot reach from an assertion: the stylesheet the transitions
	// come from, the entry point that subscribes, and the crawl harness that has to stay able to
	// fail on this noise.
	'test:view-transition-abort': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/lib/viewTransitions.ts',
			'frontend/src/main.tsx',
			'frontend/src/tailwind.css',
			'scripts/crawltest-events.ts',
			'scripts/crawltest-types.ts',
			'scripts/test-view-transition-abort.ts',
		],
	},
	// Drives two routes from different modules in process and then reads the whole backend and
	// frontend source for a route that words the header its own way, so its world is both source
	// trees plus the documents its spelling scan covers.
	'test:workspace-header-contract': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/**',
			'docs/**/*.md',
			'frontend/src/**',
			'scripts/lib/workspace-header-scan.ts',
			'scripts/lib/workspace-header-world.ts',
			'scripts/test-workspace-header-contract.ts',
		],
	},
	// Same in-process temp-DB shape as `test:impersonation-audit`: it applies the migrations and
	// exercises the guard module, so its world is the backend source plus the gate script itself.
	'test:workspace-role-predicate': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-workspace-role-predicate.ts'],
	},
	// Drives every workspace sub-resource route in process and then scans the route tree, so its
	// world is the backend source it sends requests through plus both halves of its own harness.
	'test:workspace-subresource-existence': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/**',
			'scripts/lib/workspace-subresource-scan.ts',
			'scripts/lib/workspace-subresource-world.ts',
			'scripts/test-workspace-subresource-existence.ts',
		],
	},
};
