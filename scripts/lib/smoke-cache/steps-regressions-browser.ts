/**
 * Cache dependencies for the regression gates whose world is the page.
 *
 * Split out of `steps-regressions.ts` when the two together outgrew the 300-line modularity
 * gate. The seam is what the gate has to reach for to ask its question: these render the
 * frontend or read its source, so they move when the browser code moves, while the ones left
 * behind bring the API up against a temp database and move when the server does.
 * `dependencies.ts` merges every map into the single one the cache consumes.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const BROWSER_REGRESSION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	// Reads the retry and throw rules in process and then reads the two files it cannot reach from
	// an assertion: the query client that wires them in, and the toast module that decides what a
	// rejected read says.
	'test:bad-request-recovery': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/api/errorHandling.ts',
			'frontend/src/lib/queryClient.ts',
			'frontend/src/lib/queryErrorPolicy.ts',
			'scripts/test-bad-request-recovery.ts',
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
	// Reads the frontend source tree for a dialog that clears its own form on the way out of a
	// submit, and drives the scan over synthetic fixtures, so its world is the whole frontend
	// source plus the scan and the gate that runs it.
	'test:dialog-form-survival': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/**',
			'scripts/lib/dialog-form-survival.ts',
			'scripts/test-dialog-form-survival.ts',
		],
	},
	// Reads the frontend source tree for a component that adjusts state during render, and drives
	// the scan itself over synthetic fixtures, so its world is the whole frontend source plus the
	// scan and the gate that runs it.
	'test:render-phase-sync': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/**',
			'scripts/lib/render-phase-sync.ts',
			'scripts/test-render-phase-sync.ts',
		],
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
};
