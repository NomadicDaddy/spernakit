/**
 * Cache dependencies for the workspace regression gates.
 *
 * Split from `steps-regressions.ts` when that module outgrew the 300-line modularity gate. These
 * gates share a world: the workspace routes, the membership guard behind them, and the scans that
 * read the workspace surface back out of the source. `dependencies.ts` merges every map into the
 * single one the cache consumes.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const WORKSPACE_REGRESSION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
