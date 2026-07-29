#!/usr/bin/env bun
/**
 * Regression test for `scripts/critical-path-budget.json` as app-owned generated state.
 *
 * Two properties have to hold together, and neither is visible from the type system:
 *
 *   1. The file is drift-EXCLUDED but init-INCLUDED. A derived app must receive the template's
 *      limits as a starting point and then be free to record its own, without `bun run check:drift`
 *      reporting divergence. Classified as template content — as it was before this test existed —
 *      an app with a legitimately larger critical path had to choose between permanent drift and
 *      keeping numbers it cannot meet.
 *   2. `--update-budget` recalculates BOTH limits. Regeneration used to write only the brotli limit
 *      and carry the gzip ceiling forward from whatever was already on disk, so the gzip leg was
 *      unregenerable: the operator ran the documented command, watched it report success, and got
 *      the same failing gzip limit back. That is the exact failure observed in a derived app
 *      measuring 181.11 KB gzip against a 170.00 KB budget, and assertion 4 below is what catches
 *      its return.
 *
 * The template's own committed limits are pinned as usable numbers too, and driven through the
 * evaluator: a fresh app that never regenerates is still measured, so a template shipping a budget
 * it silently skipped would satisfy every classification assertion above while enforcing nothing.
 *
 * Fixtures live under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing tracked.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import {
	BUDGET_HEADROOM,
	type BudgetResult,
	type CriticalPathBudget,
	evaluateCriticalPathBudget,
	kb,
	writeCriticalPathBudget,
} from './lib/critical-path-budget.ts';
import { enumerateInitFiles, isFileExcluded, isInitExcluded } from './lib/template/classify.ts';

const BUDGET_FILE = 'scripts/critical-path-budget.json';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'critical-path-budget-'));

const budgetPath = join(fixtureRoot, 'critical-path-budget.json');

/** Serialize a fixture budget exactly as `--update-budget` would write it. */
function writeFixture(budget: Record<string, unknown>): void {
	writeFileSync(budgetPath, `${JSON.stringify(budget, null, '\t')}\n`, 'utf-8');
}

function textOf(result: BudgetResult): string {
	return result.lines.map((line) => line.text).join('\n');
}

function evaluate(totalBrotliBytes: number, totalGzipJsBytes: number): BudgetResult {
	return evaluateCriticalPathBudget({ budgetPath, totalBrotliBytes, totalGzipJsBytes });
}

function readFixture(): Record<string, unknown> {
	return JSON.parse(readFileSync(budgetPath, 'utf-8')) as Record<string, unknown>;
}

try {
	// 1. Classification: drift-excluded (an app may record its own limits) but init-included (a
	//    fresh app receives the template's limits as a starting point). enumerateInitFiles is the
	//    copier's own enumeration, not a second opinion about it, so a file that stopped shipping
	//    would fail here rather than being inferred from the predicate alone.
	assert(
		isFileExcluded(BUDGET_FILE),
		`${BUDGET_FILE} must be excluded from drift so a derived app can record its own limits`,
	);
	assert(
		!isInitExcluded(BUDGET_FILE),
		`${BUDGET_FILE} must still be copied into a new app as its starting budget`,
	);
	assert(
		enumerateInitFiles(repoRoot).includes(BUDGET_FILE),
		`${BUDGET_FILE} must appear in the files a fresh app is scaffolded from`,
	);

	// 2. The template's committed limits are real, usable numbers. A budget shipping a zero or a
	//    missing key would make every derived app's first build either fail or skip.
	const shipped = JSON.parse(
		readFileSync(join(repoRoot, BUDGET_FILE), 'utf-8'),
	) as Partial<CriticalPathBudget>;
	const shippedBrotli = shipped.maxCriticalPathBrotliBytes;
	const shippedGzipJs = shipped.maxCriticalPathGzipJsBytes;
	assert(
		typeof shippedBrotli === 'number' && shippedBrotli > 0,
		`${BUDGET_FILE} must ship a positive maxCriticalPathBrotliBytes`,
	);
	assert(
		typeof shippedGzipJs === 'number' && shippedGzipJs > 0,
		`${BUDGET_FILE} must ship a positive maxCriticalPathGzipJsBytes`,
	);
	if (typeof shippedBrotli !== 'number' || typeof shippedGzipJs !== 'number') {
		throw new Error(`${BUDGET_FILE} limits are unusable`);
	}

	// 3. An app that has not regenerated is measured against exactly those shipped limits, and both
	//    legs are enforced independently: either one over its own ceiling fails the gate, and the
	//    failure names the measured size and the budget it broke.
	writeFixture({
		maxCriticalPathBrotliBytes: shippedBrotli,
		maxCriticalPathGzipJsBytes: shippedGzipJs,
	});

	const atLimit = evaluate(shippedBrotli, shippedGzipJs);
	assert(atLimit.ok, 'A build exactly at both shipped limits must pass');
	assert(
		textOf(atLimit).includes('within budget'),
		'A passing check must report the measured sizes as within budget',
	);

	const brotliOver = evaluate(shippedBrotli + 1, shippedGzipJs);
	assert(!brotliOver.ok, 'A critical path over the recorded brotli limit must fail');
	assert(
		textOf(brotliOver).includes(kb(shippedBrotli + 1)) &&
			textOf(brotliOver).includes(kb(shippedBrotli)),
		'The brotli failure must name the measured size and the recorded budget',
	);

	const gzipOver = evaluate(shippedBrotli, shippedGzipJs + 1);
	assert(!gzipOver.ok, 'Blocking JS over the recorded gzip limit must fail');
	const gzipOverText = textOf(gzipOver);
	assert(
		gzipOverText.includes(kb(shippedGzipJs + 1)) && gzipOverText.includes(kb(shippedGzipJs)),
		'The gzip failure must name the measured size and the recorded budget',
	);
	assert(
		gzipOverText.includes('within budget') && gzipOverText.includes('exceeds budget'),
		'A gzip-only failure must still report the passing brotli leg, so the cause is unambiguous',
	);
	assert(
		gzipOverText.includes('--update-budget'),
		'A failure must tell the operator how to regenerate an intentionally grown budget',
	);

	// 4. THE REGRESSION. Regeneration recalculates BOTH limits from the measurement. The previous
	//    implementation preserved whatever gzip ceiling was on disk, so this is reproduced with a
	//    fixture whose gzip limit is deliberately smaller than the measured size: a carried-over
	//    limit stays at 170.00 KB and the app is told to regenerate a budget it just regenerated.
	const measuredBrotli = 177_818; // 173.65 KB brotli, as measured in a derived app
	const measuredGzipJs = 185_456; // 181.11 KB gzip JS, over the 170.00 KB it was handed
	const staleGzipLimit = 170 * 1024;
	writeFixture({
		maxCriticalPathBrotliBytes: 183_620,
		maxCriticalPathGzipJsBytes: staleGzipLimit,
	});
	const beforeRegen = evaluate(measuredBrotli, measuredGzipJs);
	assert(
		!beforeRegen.ok,
		'The reported scenario must fail before regeneration, or the fixture proves nothing',
	);

	const written = writeCriticalPathBudget({
		budgetPath,
		totalBrotliBytes: measuredBrotli,
		totalGzipJsBytes: measuredGzipJs,
	});
	assert(written.ok, 'Writing a budget must succeed');
	const regenerated = readFixture();
	assert(
		regenerated['maxCriticalPathGzipJsBytes'] !== staleGzipLimit,
		'--update-budget must not carry the previous gzip limit forward',
	);
	assert(
		regenerated['maxCriticalPathBrotliBytes'] === Math.ceil(measuredBrotli * BUDGET_HEADROOM) &&
			regenerated['maxCriticalPathGzipJsBytes'] ===
				Math.ceil(measuredGzipJs * BUDGET_HEADROOM),
		`Both limits must be recalculated with ${BUDGET_HEADROOM}x headroom over the measurement`,
	);
	const writtenText = textOf(written);
	assert(
		writtenText.includes('+10% headroom') &&
			writtenText.includes(kb(Math.ceil(measuredGzipJs * BUDGET_HEADROOM))) &&
			writtenText.includes(kb(Math.ceil(measuredBrotli * BUDGET_HEADROOM))),
		'Regeneration must document the headroom it applied and report both new limits',
	);

	// 5. The regenerated budget is immediately enforceable: the build that produced it passes, and
	//    the gate has not been disabled — a build that outgrows either new limit still fails.
	const afterRegen = evaluate(measuredBrotli, measuredGzipJs);
	assert(
		afterRegen.ok,
		'A build must pass against the budget regenerated from that same build — the whole point',
	);
	assert(
		!evaluate(measuredBrotli, Math.ceil(measuredGzipJs * BUDGET_HEADROOM) + 1).ok,
		'A regenerated gzip limit must still fail a build that outgrows it',
	);
	assert(
		!evaluate(Math.ceil(measuredBrotli * BUDGET_HEADROOM) + 1, measuredGzipJs).ok,
		'A regenerated brotli limit must still fail a build that outgrows it',
	);

	// 6. Degenerate inputs: no budget file at all, and a budget predating the two-limit split.
	rmSync(budgetPath, { force: true });
	const missing = evaluate(measuredBrotli, measuredGzipJs);
	assert(missing.ok, 'A missing budget file must skip rather than fail');
	assert(
		textOf(missing).includes('Create one with'),
		'A missing budget file must tell the operator how to create one',
	);

	writeFixture({ maxCriticalPathBrotliBytes: 183_620 });
	const halfBudget = evaluate(1, 1);
	assert(
		!halfBudget.ok,
		'A budget missing the gzip limit must fail rather than enforce half a budget',
	);
	assert(
		textOf(halfBudget).includes('--update-budget'),
		'A half budget must point the operator at regeneration',
	);

	console.log(`Critical-path budget ownership regression test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
