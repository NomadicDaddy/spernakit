/**
 * Cache dependencies for the feature-integration guard and its real-CLI regression.
 *
 * These entries move together because the regression exercises the guard against an isolated
 * project root. Keeping them outside `steps-checks.ts` leaves that broader guard map below the
 * repository's 300-line ceiling.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const INTEGRATION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	'check:feature-integration': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/src/create-api-app*.ts',
			'backend/src/routes/**/*.ts',
			'frontend/src/components/**/*.ts',
			'frontend/src/components/**/*.tsx',
			'frontend/src/pages/**/*.ts',
			'frontend/src/pages/**/*.tsx',
			'frontend/src/routes/lazyPages.ts',
			'scripts/check-feature-integration.ts',
			'scripts/lib/feature-integration/**/*.ts',
		],
	},
	'test:feature-integration': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/check-feature-integration.ts',
			'scripts/lib/feature-integration/**/*.ts',
			'scripts/test-feature-integration.ts',
		],
	},
	'test:scaffolded-hooks': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'.githooks/pre-push',
			'.githooks/screenshot-guard.sh',
			'package.json',
			'scaffolding/.githooks/aidd-history-guard.sh',
			'scaffolding/.githooks/pre-push',
			'scaffolding/.githooks/screenshot-guard.sh',
			'scripts/check-template-drift.ts',
			'scripts/lib/init/scaffold.ts',
			'scripts/lib/template/*.ts',
			'scripts/test-scaffolded-hooks.ts',
		],
	},
	'test:wait-for-http': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/smoke.json',
			'scripts/test-wait-for-http.ts',
			'scripts/wait-for-http.ts',
		],
	},
};
