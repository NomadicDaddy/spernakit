/**
 * Cache dependencies for the `test:*` self-tests: the bespoke assertion scripts that drive one of
 * this repository's own tools against a fixture and assert on its real output.
 *
 * Their inputs are a fixed, enumerable set of source files, which is what makes them cacheable at
 * all. Split from `steps-checks.ts` to keep each map inside the 300-line modularity gate;
 * `dependencies.ts` merges them into the single map the cache consumes.
 */

import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const SELF_TEST_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
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
			'scripts/critical-path-budget.json',
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
	'test:critical-path-budget': {
		// The classifier is an input because the test also pins the budget file's drift/init
		// classification, not just the budget evaluator's behavior.
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/critical-path-budget.json',
			'scripts/lib/critical-path-budget.ts',
			'scripts/lib/template/classify.ts',
			'scripts/test-critical-path-budget.ts',
		],
	},
	'test:fleet-manifest-sync': {
		// The test drives both fleet CLIs against a self-contained two-app fixture, so the reader,
		// the validator, and the writer are all inputs. Unlike `test:fleet-manifest` it never reads
		// the real fleet, which is what makes it cacheable.
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/check-fleet-manifest.ts',
			'scripts/lib/fleet/*.ts',
			'scripts/read-fleet-manifest.ps1',
			'scripts/sync-fleet-manifest.ts',
			'scripts/test-fleet-manifest-sync.ts',
		],
	},
	'test:gate-conventions': {
		// The gate and its rule library are the inputs; the fixture the test writes is created and
		// deleted inside the run, so it can never be a cache input.
		excludes: COMMON_EXCLUDES,
		globs: [
			'package.json',
			'scripts/check-gate-conventions.ts',
			'scripts/lib/gate/**/*.ts',
			'scripts/test-gate-conventions.ts',
		],
	},
	'test:lost-lines': {
		// The test drives the real CLI against a purpose-built template/app pair of git repos, so the
		// whole drift library is an input: the audit reaches classify.ts for scaffold mapping and
		// exclusion, and repo.ts for template resolution.
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/audit-lost-lines.ts',
			'scripts/lib/template/*.ts',
			'scripts/test-lost-lines.ts',
		],
	},
	'test:override-deltas': {
		// The test drives the real CLI against a two-tag git fixture, so the whole drift library is an
		// input: overrides.ts parses the entries, classify.ts decides branding and security relevance,
		// text.ts performs the line comparison, and repo.ts reads the target version.
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/check-override-deltas.ts',
			'scripts/lib/template/*.ts',
			'scripts/test-override-deltas.ts',
		],
	},
	'test:template-drift': {
		// The test drives the real CLI against a two-tag git fixture, so the whole drift library is
		// an input: classification, normalization, overrides and reporting all decide the verdict.
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/check-template-drift.ts',
			'scripts/lib/template/*.ts',
			'scripts/template-shared.ts',
			'scripts/test-template-deletions.ts',
			'scripts/test-template-drift.ts',
		],
	},
};
