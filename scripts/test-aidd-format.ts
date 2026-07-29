#!/usr/bin/env bun
/**
 * Regression self-test for `scripts/check-aidd-format.ts`.
 *
 * The template ignores its own `/.aidd/`, so `bun run check:aidd-format` always takes the skip
 * branch here and the gate would ship to derived apps completely unexercised — which is the same
 * class of vacuous pass the gate exists to prevent. This drives the real check against throwaway
 * project roots that mimic a derived app: `.aidd/` present, `.gitignore` not excluding it.
 *
 * The fixtures live under `<repo>/tmp/` because Prettier resolves config by walking up from each
 * file: a fixture inside the checkout picks up the repository's own `.prettierrc` (tabs, sorted
 * JSON keys) and its installed plugins, which is exactly the shape being asserted. `/tmp/` is both
 * gitignored and prettierignored, and `--ignore-path scripts/aidd-prettierignore` overrides the
 * latter for the files under test.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import { collectAiddMetadataFiles, runAiddFormat } from './check-aidd-format.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'aidd-format-'));

/** The aidd runtime's serializer shape: 2-space indent, id first, keys unsorted. */
const RUNTIME_SHAPE = '{\n  "id": "sample-feature",\n  "passes": false,\n  "dependencies": []\n}\n';

function writeFixtureFile(relativePath: string, contents: string): string {
	const fullPath = join(fixtureRoot, relativePath);
	mkdirSync(join(fullPath, '..'), { recursive: true });
	writeFileSync(fullPath, contents);
	return fullPath;
}

try {
	// 1. No `.aidd/` at all: skip, not failure. A repo without agent metadata has nothing to gate.
	let result = await runAiddFormat(fixtureRoot);
	assert(result.code === 0, 'Absent .aidd/ must exit 0');
	assert(result.skippedReason !== undefined, 'Absent .aidd/ must report an explicit skip');
	assert(result.examined.length === 0, 'Absent .aidd/ must examine nothing');

	// 2. `.aidd/` exists but holds no metadata: the vacuous-pass case, and a hard failure.
	writeFixtureFile('.aidd/iterations/run-1.log', 'not metadata\n');
	result = await runAiddFormat(fixtureRoot);
	assert(result.code === 1, 'Tracked .aidd/ with 0 metadata files must exit non-zero');
	assert(result.examined.length === 0, 'Empty working set must be reported as 0 examined');

	// 3. Metadata in the aidd runtime's shape must fail the check.
	const featurePath = writeFixtureFile(
		'.aidd/features/sample-feature/feature.json',
		RUNTIME_SHAPE,
	);
	writeFixtureFile(
		'.aidd/roadmap.json',
		'{\n  "milestones": [{"id": "m1", "features": []}]\n}\n',
	);
	result = await runAiddFormat(fixtureRoot);
	assert(result.code === 1, '2-space id-first metadata must exit non-zero');
	assert(
		result.examined.length === 2,
		`Expected 2 files examined, got ${result.examined.length}`,
	);
	assert(result.changed.length === 2, `Expected 2 files flagged, got ${result.changed.length}`);

	// 4. Enumeration covers roadmap.json and every feature.json, and nothing else in the tree.
	writeFixtureFile('.aidd/features/sample-feature/notes.md', '# notes\n');
	writeFixtureFile('.aidd/CHANGELOG.md', '# changelog\n');
	writeFixtureFile('.aidd/features/not-a-feature/other.json', '{"a":1}\n');
	const enumerated = await collectAiddMetadataFiles(fixtureRoot);
	assert(enumerated.length === 2, `Expected 2 enumerated files, got ${enumerated.length}`);
	assert(
		enumerated.every((file) => file.endsWith('feature.json') || file.endsWith('roadmap.json')),
		'Enumeration must exclude non-metadata run artifacts',
	);

	// 5. Write mode rewrites the same enumerated files in place and reports the count.
	result = await runAiddFormat(fixtureRoot, { write: true });
	assert(result.code === 0, 'format:aidd must exit 0');
	assert(
		result.changed.length === 2,
		`format:aidd must report 2 written, got ${result.changed.length}`,
	);
	const rewritten = readFileSync(featurePath, 'utf8');
	assert(rewritten.includes('\t'), 'format:aidd must produce the repository tab-indented shape');
	assert(
		rewritten.indexOf('"dependencies"') < rewritten.indexOf('"id"'),
		'format:aidd must produce sorted keys, not the runtime id-first order',
	);

	// 6. The same tree now passes, and reports a non-zero examined count.
	result = await runAiddFormat(fixtureRoot);
	assert(result.code === 0, 'Reformatted metadata must pass the check');
	assert(result.examined.length === 2, 'Passing run must still report 2 files examined');
	assert(result.changed.length === 0, 'Passing run must flag no files');

	// 7. A `.gitignore` that excludes /.aidd/ skips, even with metadata present: the template case.
	writeFileSync(join(fixtureRoot, '.gitignore'), '# comment\nnode_modules/\n/.aidd/\n');
	result = await runAiddFormat(fixtureRoot);
	assert(result.code === 0, 'Gitignored .aidd/ must exit 0');
	assert(result.skippedReason !== undefined, 'Gitignored .aidd/ must report an explicit skip');

	console.log(`aidd metadata format gate self-test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
