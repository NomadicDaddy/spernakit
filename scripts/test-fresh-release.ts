#!/usr/bin/env bun
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	FRESH_RELEASE_VERSION,
	type FreshReleaseFile,
	validateFreshRelease,
} from './lib/fresh-release/validation.ts';
import { isInitExcluded } from './lib/template/exclusions.ts';
import { renderBaselineNotes } from './release-notes.ts';
import {
	MIN_SUPPORTED_TEMPLATE_VERSION,
	supportedSourceVersionError,
} from './template-sync-plan.ts';

const root = resolve(import.meta.dir, '..');

const baselineFiles: FreshReleaseFile[] = [
	{
		path: 'docs/template/CHANGELOG.md',
		text: `# Changelog\n\n## [${FRESH_RELEASE_VERSION}] - 2026-07-26\n\nCurrent baseline.\n`,
	},
	{
		path: 'docs/template/API_REFERENCE.md',
		text: 'The API is served at /api/v1. A fixture may depend on action v2.2.0.',
	},
];

function issuesFor(...files: FreshReleaseFile[]): string[] {
	return validateFreshRelease({
		files: [...baselineFiles, ...files],
		packageVersion: FRESH_RELEASE_VERSION,
	});
}

assert.deepEqual(issuesFor(), [], 'generic API, dependency, and fixture versions must be allowed');
assert.ok(
	issuesFor({ path: 'docs/template/MIGRATION_V3_TO_V4.md', text: 'Migration.' }).some((issue) =>
		issue.includes('retired release-history artifact'),
	),
	'migration documents must be rejected',
);
assert.ok(
	issuesFor({ path: 'docs/testing/OAUTH-TEST-PLAN.md', text: 'Spernakit v3.27.0' }).some(
		(issue) => issue.includes('older Spernakit release'),
	),
	'older named Spernakit releases must be rejected',
);
assert.ok(
	issuesFor({ path: 'README.md', text: 'This is a clean-history re-release.' }).some((issue) =>
		issue.includes('historical narrative'),
	),
	'fresh-release cleanup narratives must be rejected',
);
assert.ok(
	issuesFor({ path: 'README.md', text: 'Optional AIDD integration.' }).some((issue) =>
		issue.includes('visible aidd branding'),
	),
	'uppercase public display branding must be rejected',
);

const staleChangelog = validateFreshRelease({
	files: [
		{
			path: 'docs/template/CHANGELOG.md',
			text: '# Changelog\n\n## [3.29.0]\n\nCurrent.\n\n## [3.28.2]\n\nEarlier.\n',
		},
	],
	packageVersion: FRESH_RELEASE_VERSION,
});
assert.ok(
	staleChangelog.some((issue) => issue.includes('predating')),
	'pre-baseline changelog history must be rejected',
);

// The baseline is a floor, not a pin: releases cut after it accumulate changelog entries above
// the baseline, and both the version and the leading heading move with them.
assert.deepEqual(
	validateFreshRelease({
		files: [
			{
				path: 'docs/template/CHANGELOG.md',
				text: '# Changelog\n\n## [3.30.0] - 2026-07-26\n\nLater.\n\n## [3.29.0] - 2026-07-26\n\nBaseline.\n',
			},
		],
		packageVersion: '3.30.0',
	}),
	[],
	'releases above the baseline must be accepted',
);
assert.ok(
	validateFreshRelease({
		files: [
			{
				path: 'docs/template/CHANGELOG.md',
				text: '# Changelog\n\n## [3.30.0]\n\nLater.\n\n## [3.29.0]\n\nBaseline.\n',
			},
		],
		packageVersion: FRESH_RELEASE_VERSION,
	}).some((issue) => issue.includes('must lead with')),
	'a changelog ahead of package.json must be rejected',
);
assert.ok(
	validateFreshRelease({
		files: [
			{
				path: 'docs/template/CHANGELOG.md',
				text: '# Changelog\n\n## [3.30.0]\n\nLater.\n',
			},
		],
		packageVersion: '3.30.0',
	}).some((issue) => issue.includes('must retain')),
	'dropping the baseline entry must be rejected',
);
assert.ok(
	validateFreshRelease({
		files: [
			{
				path: 'docs/template/CHANGELOG.md',
				text: '# Changelog\n\n## [3.29.0]\n\nBaseline.\n',
			},
		],
		packageVersion: '3.28.2',
	}).some((issue) => issue.includes('at least the')),
	'a version below the baseline must be rejected',
);
assert.ok(
	validateFreshRelease({
		files: [
			{
				path: 'docs/template/CHANGELOG.md',
				text: '# Changelog\n\n## [3.29.0]\n\nBaseline.\n\n## [3.30.0]\n\nOut of order.\n',
			},
		],
		packageVersion: FRESH_RELEASE_VERSION,
	}).some((issue) => issue.includes('newest first')),
	'out-of-order changelog headings must be rejected',
);
assert.equal(MIN_SUPPORTED_TEMPLATE_VERSION, FRESH_RELEASE_VERSION);
assert.match(
	supportedSourceVersionError('3.28.2') ?? '',
	/public baseline/,
	'sources below the fresh baseline must fail clearly',
);
assert.equal(supportedSourceVersionError('3.29.0'), null);
assert.equal(supportedSourceVersionError('3.30.0'), null);

const baselineNotes = renderBaselineNotes(
	'# Changelog\n\n## [3.29.0] - 2026-07-26\n\nComplete current capabilities.\n',
	'v3.29.0',
);
assert.equal(baselineNotes, 'Complete current capabilities.\n');
assert.ok(!baselineNotes.includes('/compare/'));
assert.throws(
	() => renderBaselineNotes('# Changelog\n', 'v3.29.0'),
	/has no entry/,
	'a missing baseline changelog entry must fail',
);

const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
assert.match(workflow, /tags: \['v\*\.\*\.\*']/);
assert.match(workflow, /bun-version-file: package\.json/);
assert.match(workflow, /Require a green CI run for this commit/);
assert.match(workflow, /bun scripts\/release-notes\.ts "\$\{TAG_NAME\}"/);
assert.match(workflow, /gh release create .*--verify-tag/);

const smoke = readFileSync(resolve(root, 'scripts/smoke.json'), 'utf8');
assert.match(smoke, /bun run check:fresh-release/);
assert.match(smoke, /"templateOnly": true/);

const releaseResult = Bun.spawnSync(
	['bun', 'scripts/release-notes.ts', `v${FRESH_RELEASE_VERSION}`, '--no-previous'],
	{ cwd: root, stderr: 'pipe', stdout: 'pipe' },
);
assert.equal(releaseResult.exitCode, 0, releaseResult.stderr.toString());
const releaseOutput = releaseResult.stdout.toString();
assert.match(releaseOutput, /### Application foundation/);
assert.ok(!releaseOutput.includes('/compare/'));
assert.ok(!/\bv\d+\.\d+\.\d+\b/.test(releaseOutput));

for (const path of [
	'scripts/check-fresh-release.ts',
	'scripts/lib/fresh-release/validation.ts',
	'scripts/test-fresh-release.ts',
]) {
	assert.equal(isInitExcluded(path), true, `${path} must remain template-only`);
}

console.log('Fresh-release validation tests passed.');
