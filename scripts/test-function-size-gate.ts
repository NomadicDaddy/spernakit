import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseReport, recordBaseline } from './check-function-size.ts';
import { STEP_DEPENDENCIES } from './lib/smoke-cache/dependencies.ts';

/**
 * Proves the function-size ratchet's reading of ESLint's report: ordinary rule messages become
 * offenders with their measure, a nonzero exit with only rule messages is still a measurement, and
 * a report that failed to measure a file (fatal or rule-less diagnostic), an empty report or
 * non-JSON output is refused rather than counted as an improvement.
 */
const ROOT = 'D:\\repo';
const file = (name: string, messages: object[]): object => ({
	filePath: `${ROOT}\\backend\\src\\${name}`,
	messages,
});
const over = (rule: 'complexity' | 'max-lines-per-function', name: string, n: number): object => ({
	line: 10,
	message:
		rule === 'complexity'
			? `Function '${name}' has a complexity of ${n}. Maximum allowed is 7.`
			: `Function '${name}' has too many lines (${n}). Maximum allowed is 40.`,
	ruleId: rule,
});

function run(): void {
	// A normal report: two complexity offenders and one length offender, measures extracted.
	const normal = JSON.stringify([
		file('a.ts', [
			over('complexity', 'alpha', 12),
			over('max-lines-per-function', 'alpha', 61),
		]),
		file('b.ts', [
			over('complexity', 'beta', 9),
			{ line: 1, message: 'Unused.', ruleId: 'no-unused-vars' },
		]),
		file('c.ts', []),
	]);
	const measured = parseReport(normal, 0, '', ROOT);
	assert.equal(measured.files, 3);
	assert.deepEqual(
		measured.complexity.map((o) => [o.file, o.name, o.measure]),
		[
			['backend/src/a.ts', 'alpha', 12],
			['backend/src/b.ts', 'beta', 9],
		],
	);
	assert.deepEqual(
		measured.lines.map((o) => o.measure),
		[61],
	);

	// ESLint exits 1 when any message has error severity; with rule messages only, that is still a
	// complete measurement and the counts are read.
	assert.equal(parseReport(normal, 1, '', ROOT).complexity.length, 2);

	// A fatal diagnostic on one file means that file's functions were not counted: refused, with
	// the file named, never a pass that offers to lower the baseline.
	const fatal = JSON.stringify([
		file('a.ts', [over('complexity', 'alpha', 12)]),
		file('broken.ts', [
			{ fatal: true, line: 3, message: 'Parsing error: Unexpected token', ruleId: null },
		]),
	]);
	assert.throws(
		() => parseReport(fatal, 1, '', ROOT),
		/could not measure 1 file\(s\).*backend\/src\/broken\.ts/,
	);

	// A rule-less, non-fatal diagnostic is the same refusal.
	const ruleless = JSON.stringify([
		file('a.ts', [{ line: 1, message: 'Something.', ruleId: null }]),
	]);
	assert.throws(() => parseReport(ruleless, 0, '', ROOT), /could not measure 1 file/);

	// No report, or output that is not JSON, is no measurement.
	assert.throws(() => parseReport('', 2, 'boom', ROOT), /no report \(exit 2\)/);
	assert.throws(() => parseReport('[]', 0, '', ROOT), /no report/);
	assert.throws(() => parseReport('Oops: something', 2, '', ROOT), /not JSON/);

	// A baseline is recorded once, and recording again is refused, because a baseline that could
	// be rewritten at will would let the counts rise. Both outcomes run against a throwaway path
	// with a stand-in measurement: called on the repository's own path, the first would write a
	// real baseline into any app that has none, ahead of the gate that is meant to ask for it.
	const ownBaseline = resolve(import.meta.dir, 'function-size-baseline.json');
	const ownBefore = existsSync(ownBaseline) ? readFileSync(ownBaseline, 'utf8') : null;
	const scratch = mkdtempSync(join(tmpdir(), 'function-size-gate-'));
	const scratchBaseline = join(scratch, 'function-size-baseline.json');
	const standIn = (): ReturnType<typeof parseReport> => parseReport(normal, 0, '', ROOT);
	const said: string[] = [];
	const realError = console.error;
	const realLog = console.log;
	console.error = (message: string) => said.push(message);
	console.log = (message: string) => said.push(message);
	try {
		assert.equal(recordBaseline(scratchBaseline, standIn), 0);
		const recorded = readFileSync(scratchBaseline, 'utf8');
		assert.deepEqual(JSON.parse(recorded), {
			complexity: { over: 2, threshold: 7 },
			lines: { over: 1, threshold: 40 },
		});
		assert.equal(recordBaseline(scratchBaseline, standIn), 1);
		assert.equal(readFileSync(scratchBaseline, 'utf8'), recorded);
	} finally {
		console.error = realError;
		console.log = realLog;
		rmSync(scratch, { force: true, recursive: true });
	}
	assert.match(said.join('\n'), /baseline recorded/);
	assert.match(said.join('\n'), /already has a baseline/);
	// The repository's own baseline is exactly as it was, present or absent.
	assert.equal(existsSync(ownBaseline) ? readFileSync(ownBaseline, 'utf8') : null, ownBefore);

	// The smoke cache must invalidate on everything the gate measures or measures with. The gate
	// hands ESLint whole directories and the config selects ts, tsx, js and jsx, so a source file of
	// any of those extensions under any root, every configuration the parse depends on, and the
	// toolchain manifests must all match the step's dependency globs and escape its excludes.
	const entry = STEP_DEPENDENCIES['check:function-size'];
	assert(entry, 'check:function-size has a smoke-cache entry');
	const covered = (path: string): boolean =>
		entry.globs.some((glob) => new Bun.Glob(glob).match(path)) &&
		!entry.excludes.some((glob) => new Bun.Glob(glob).match(path));
	for (const path of [
		'backend/src/services/new.ts',
		'backend/src/services/new.js',
		'frontend/src/pages/New.tsx',
		'frontend/src/pages/New.jsx',
		'frontend/src/pages/legacy.js',
		'shared/src/new.ts',
		'shared/src/new.js',
		'eslint.config.js',
		'frontend/eslint.config.js',
		'tsconfig.json',
		'backend/tsconfig.json',
		'frontend/tsconfig.app.json',
		'shared/tsconfig.json',
		'package.json',
		'backend/package.json',
		'bun.lock',
		'scripts/check-function-size.ts',
		'scripts/function-size-baseline.json',
	])
		assert(covered(path), `${path} is an input of the gate and must invalidate its cache`);
	for (const path of ['backend/dist/out.js', 'frontend/src/styles.css', 'docs/retention.md'])
		assert(!covered(path), `${path} is not an input of the gate`);

	console.log(
		'[OK] function-size gate reads rule offenders with their measures, refuses fatal, rule-less, empty and non-JSON reports, refuses to re-record a baseline, and its cache entry covers what it measures.',
	);
}

run();
