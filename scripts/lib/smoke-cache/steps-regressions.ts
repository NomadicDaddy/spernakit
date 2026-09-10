/**
 * Cache dependencies for the regression gates: the ones that drive the running application in
 * process, against a temp database or a rendered page, to prove a fixed defect stays fixed.
 *
 * Split from `steps-toolchain.ts`, which holds the steps that compile, lint, format, validate
 * config, or exercise a script in isolation. These are a different kind of world: each one's
 * dependency set is the slice of the application its request passes through, so they move when
 * the product moves rather than when the toolchain does. `dependencies.ts` merges every map into
 * the single one the cache consumes.
 *
 * The gates whose question needs the API standing up live here. The ones whose world is the
 * page rather than the server live in `steps-regressions-browser.ts`, split out when the two
 * together outgrew the 300-line modularity gate.
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
	// Sends real sign-ins through the limiter and reads the settings route back, so its world is
	// the rate limit plugin family, the auth security service that owns the shared rule, the login
	// and settings routes the two probes use, and the card that states the result to a reader.
	'test:auth-rate-limit-state': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/config/**',
			'backend/src/create-api-app.ts',
			'backend/src/db/seed/**',
			'backend/src/plugins/**',
			'backend/src/routes/auth/**',
			'backend/src/routes/settings/auth-security.ts',
			'backend/src/services/auth/authSecurityService.ts',
			'backend/src/services/authService.ts',
			'frontend/src/api/authSecurity.ts',
			'frontend/src/pages/settings/auth/AuthRateLimitSection.tsx',
			'frontend/src/pages/settings/auth/AuthenticationTab.tsx',
			'scripts/lib/auth-ordering-fixture.ts',
			'scripts/test-auth-rate-limit-state.ts',
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
	// Boots the real application and sends one anonymous request per registered route, so its
	// world is every route file, the plugins and guards those requests pass through, the app
	// bootstrap that mounts them, the migrations and seed the boot needs, and the list of routes
	// that are public on purpose.
	'test:public-route-surface': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/create-api-app.ts',
			'backend/src/db/seed/**',
			'backend/src/guards/**',
			'backend/src/plugins/**',
			'backend/src/routes/**',
			'scripts/lib/public-routes.ts',
			'scripts/test-public-route-surface.ts',
		],
	},
	// Same in-process temp-DB shape as `test:impersonation-audit` above.
	'test:retention-zero': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/drizzle/**', 'backend/src/**', 'scripts/test-retention-zero.ts'],
	},
	// Drives the three routes that re-check a current password in process and then reads those
	// route files back for a rejection that answers with the sign-in code, so its world is the
	// route tree, the services behind it, the shared error codes both sides name, the module the
	// browser keeps its sentences in, and the fixture, scan and gate themselves.
	'test:step-up-password-message': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/routes/**',
			'backend/src/services/auth/**',
			'backend/src/utils/errorResponse.ts',
			'backend/src/utils/errorResponseBuilders.ts',
			'frontend/src/api/errorHandling.ts',
			'scripts/lib/auth-ordering-fixture.ts',
			'scripts/lib/step-up-password.ts',
			'scripts/test-step-up-password-message.ts',
			'shared/src/errorCodes.ts',
		],
	},
	// Runs in process against the loaded configuration: what it asserts moves when the file
	// validation service, the request-body ceiling, or the configured MIME allowlist and size
	// limits move, so the config tree is part of its world alongside the backend source.
	'test:upload-validation': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/src/**', 'config/**', 'scripts/test-upload-validation.ts'],
	},
	// Puts a corpus of names to the shared validator and to the real create-user route in process,
	// and then reads both source trees for a rival copy of the rule, so its world is the frontend
	// and backend sources, the policy module they read, the fixture that boots the API, and the
	// scan and gate themselves.
	'test:username-parity': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/**',
			'frontend/src/**',
			'scripts/lib/auth-ordering-fixture.ts',
			'scripts/lib/username-parity.ts',
			'scripts/test-username-parity.ts',
			'shared/src/usernamePolicy.ts',
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
			'scripts/lib/workspace-subresource-claims.ts',
			'scripts/lib/workspace-subresource-scan.ts',
			'scripts/lib/workspace-subresource-tally.ts',
			'scripts/lib/workspace-subresource-world.ts',
			'scripts/test-workspace-subresource-existence.ts',
		],
	},
};
