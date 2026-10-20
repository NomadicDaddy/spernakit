/**
 * Cache dependencies for the authentication and session regression gates: the ones that sign
 * in through the real login path, drive token or password behavior, and read the result back
 * through the API. They share the ephemeral key fixture (`scripts/lib/test-auth-keys.ts`), so
 * they move together and their worlds are mostly the auth tree.
 *
 * Split from `steps-regressions.ts` when the input maps for the extracted test helpers grew the
 * set past the 300-line modularity gate, following the same split as
 * `steps-regressions-browser.ts` and `steps-regressions-workspace.ts`.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const AUTH_REGRESSION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
			'scripts/lib/audit-filter-seed.ts',
			'scripts/lib/test-auth-keys.ts',
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
			'scripts/lib/test-auth-keys.ts',
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
			'scripts/lib/test-auth-keys.ts',
			'scripts/test-auth-rate-limit-state.ts',
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
	// writers it drives, and the guard those requests pass through. It also resolves the step's link
	// against the frontend, which adds the account pages and the route table it reads them from.
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
			'frontend/src/pages/profile/**',
			'frontend/src/routes/lazyPages.ts',
			'frontend/src/routes/routeGroups.tsx',
			'scripts/lib/password-form-route.ts',
			'scripts/lib/test-auth-keys.ts',
			'scripts/test-onboarding-password-step.ts',
		],
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
			'scripts/lib/test-auth-keys.ts',
			'scripts/test-step-up-password-message.ts',
			'shared/src/errorCodes.ts',
		],
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
			'scripts/lib/test-auth-keys.ts',
			'scripts/test-username-parity.ts',
			'shared/src/usernamePolicy.ts',
		],
	},
};
