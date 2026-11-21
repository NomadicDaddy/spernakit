import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseReport, recordBaseline, runCheckFunctionSize } from './check-function-size.ts';
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

type Measured = ReturnType<typeof parseReport>;
type Gate = { code: number; file: null | string; said: string };

/** A stand-in measurement with the given numbers of offenders, recording the thresholds it got. */
function counted(complexity: number, lines: number, seen: number[][] = []) {
	const offenders = (n: number, base: number): Measured['lines'] =>
		Array.from({ length: n }, (_, i) => ({
			file: 'backend/src/x.ts',
			line: base + i,
			measure: 50 + i,
			name: `f${String(base + i)}`,
		}));
	return (baseline: { complexity: { threshold: number }; lines: { threshold: number } }) => {
		seen.push([baseline.complexity.threshold, baseline.lines.threshold]);
		return { complexity: offenders(complexity, 1), files: 3, lines: offenders(lines, 100) };
	};
}

/**
 * Drives the real ratchet, runCheckFunctionSize, through every outcome against a throwaway
 * baseline: a rise fails and names the worst offenders, an unchanged count passes, a fall passes
 * and only --update-baseline writes it down, an update never raises a count, and the thresholds
 * are carried into the measurement untouched.
 */
async function ratchetOutcomes(): Promise<void> {
	const scratch = mkdtempSync(join(tmpdir(), 'function-size-ratchet-'));
	const path = join(scratch, 'function-size-baseline.json');
	const start = { complexity: { over: 5, threshold: 7 }, lines: { over: 4, threshold: 40 } };
	const reset = (): void => writeFileSync(path, `${JSON.stringify(start, null, '\t')}\n`);
	const gate = async (
		update: boolean,
		measureWith: ReturnType<typeof counted>,
	): Promise<Gate> => {
		const said: string[] = [];
		const [realError, realLog] = [console.error, console.log];
		console.error = (message: string) => said.push(message);
		console.log = (message: string) => said.push(message);
		try {
			const code = await runCheckFunctionSize(update, path, measureWith);
			const file = existsSync(path) ? readFileSync(path, 'utf8') : null;
			return { code, file, said: said.join('\n') };
		} finally {
			[console.error, console.log] = [realError, realLog];
		}
	};
	try {
		reset();
		const recorded = readFileSync(path, 'utf8');
		const seen: number[][] = [];
		const same = await gate(false, counted(5, 4, seen));
		assert.equal(same.code, 0);
		assert.match(same.said, /ratchet holds: 5 functions over complexity 7 and 4 over 40 lines/);
		assert.deepEqual(seen, [[7, 40]], 'the measurement runs at the baseline thresholds');

		const rose = await gate(false, counted(6, 4));
		assert.equal(rose.code, 1, 'one more function over complexity fails');
		assert.match(rose.said, /complexity: 6 functions over 7, baseline 5/);
		assert.match(rose.said, /worst complexity:\n {2}- backend\/src\/x\.ts:\d+ f\d+ \(55\)/);
		assert.equal(rose.file, recorded);
		const roseUpdating = await gate(true, counted(5, 5));
		assert.equal(roseUpdating.code, 1, '--update-baseline does not let a count rise');
		assert.equal(roseUpdating.file, recorded);
		const mixed = await gate(true, counted(3, 5));
		assert.equal(mixed.code, 1, 'a fall in one count does not pay for a rise in the other');
		assert.equal(mixed.file, recorded);

		const fell = await gate(false, counted(4, 4));
		assert.equal(fell.code, 0);
		assert.match(fell.said, /a count fell .*run with --update-baseline/);
		assert.equal(fell.file, recorded, 'a fall is not written down without --update-baseline');
		const lowered = await gate(true, counted(4, 3));
		assert.equal(lowered.code, 0);
		assert.deepEqual(JSON.parse(lowered.file ?? 'null'), {
			complexity: { over: 4, threshold: 7 },
			lines: { over: 3, threshold: 40 },
		});
		const tightened = await gate(false, counted(5, 4));
		assert.equal(tightened.code, 1, 'once lowered, the old counts no longer pass');

		rmSync(path);
		const missing = await gate(false, counted(0, 0));
		assert.equal(missing.code, 1);
		assert.match(missing.said, /has no baseline/);
		assert.equal(missing.file, null, 'a missing baseline is refused, not recorded');
		reset();
		const none = await gate(false, (b) => ({ ...counted(0, 0)(b), files: 0 }));
		assert.equal(none.code, 1, 'a measurement that scanned no files is refused');
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}

	// The CLI parses strictly and has no way to skip the ratchet: an unknown flag is refused before
	// anything is measured or written.
	const ownBaseline = resolve(import.meta.dir, 'function-size-baseline.json');
	const before = readFileSync(ownBaseline, 'utf8');
	const skip = spawnSync('bun', [resolve(import.meta.dir, 'check-function-size.ts'), '--skip'], {
		encoding: 'utf8',
	});
	assert.notEqual(skip.status, 0, 'an unknown flag such as --skip is refused');
	assert.match(
		`${skip.stderr}${skip.stdout}`,
		/Unknown option '--skip'|ERR_PARSE_ARGS_UNKNOWN_OPTION/,
	);
	assert.equal(readFileSync(ownBaseline, 'utf8'), before);

	console.log(
		'[OK] function-size ratchet fails a rise and names the worst offenders, passes an unchanged or lower count, writes a lower count only with --update-baseline and never a higher one, refuses a missing baseline or empty scan, measures at the baseline thresholds, and offers no skip flag.',
	);
}

run();
await ratchetOutcomes();
