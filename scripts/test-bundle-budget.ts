#!/usr/bin/env bun
/**
 * Regression test for `scripts/bundle-budget.json` as app-owned generated state.
 *
 * Two properties have to hold together, and neither is visible from the type system:
 *
 *   1. The file is drift-EXCLUDED but init-INCLUDED. A derived app must receive the template's
 *      budget as a starting point and then be free to record its own numbers, without
 *      `bun run check:drift` reporting divergence. Classified `pure` — as it was before this
 *      test existed — an app larger than the template had to choose between permanent drift and
 *      keeping the template's numbers while being measured against a bundle it does not build.
 *      Three of eleven derived apps hand-wrote a `.templateoverrides` entry to escape that.
 *   2. The budget is only enforced when it was measured from THIS app. Drift exclusion alone
 *      would silence the only signal an app had that its budget belonged to someone else, so the
 *      recorded `appSlug` replaces it: absent or foreign provenance skips the comparison and tells
 *      the operator to regenerate, rather than producing a verdict from the wrong bundle.
 *
 * The template's own budget is pinned too — a template that skipped its own budget check would
 * satisfy every assertion below while enforcing nothing.
 *
 * Fixtures live under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing tracked.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import {
	BUDGET_HEADROOM,
	type BudgetResult,
	evaluateBundleBudget,
	kb,
	writeBundleBudget,
} from './lib/bundle-budget.ts';
import { isFileExcluded, isInitExcluded } from './lib/template/exclusions.ts';

const BUDGET_FILE = 'scripts/bundle-budget.json';
/** Behavior owned by scripts/test-critical-path-budget.ts; only the boundary is asserted here. */
const CRITICAL_PATH_FILE = 'scripts/critical-path-budget.json';

const THIS_APP = 'spernakit';
const OTHER_APP = 'derivedapp';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'bundle-budget-'));

const budgetPath = join(fixtureRoot, 'bundle-budget.json');

/** Serialize a fixture budget exactly as `--update-budget` would write it. */
function writeFixture(budget: Record<string, unknown>): void {
	writeFileSync(budgetPath, `${JSON.stringify(budget, null, '\t')}\n`, 'utf-8');
}

function textOf(result: BudgetResult): string {
	return result.lines.map((line) => line.text).join('\n');
}

/** Evaluate the fixture budget against measured totals, as this app. */
function evaluateAs(appSlug: string, totalCssBytes: number, totalJsBytes: number): BudgetResult {
	return evaluateBundleBudget({ appSlug, budgetPath, totalCssBytes, totalJsBytes });
}

try {
	// 1. Classification: drift-excluded (an app may record its own numbers) but init-included (a
	//    fresh app receives the template's numbers as a starting point).
	assert(
		isFileExcluded(BUDGET_FILE),
		`${BUDGET_FILE} must be excluded from drift so a derived app can record its own budget`,
	);
	assert(
		!isInitExcluded(BUDGET_FILE),
		`${BUDGET_FILE} must still be copied into a new app as its starting budget`,
	);

	// 2. The neighbouring critical-path budget is app-owned on the same terms, but the appSlug
	//    provenance stamp is deliberately NOT extended to it: its limits are dominated by the shared
	//    framework runtime every app inherits, so the template's numbers are a meaningful starting
	//    ceiling rather than a verdict from someone else's build. Asserting that boundary here keeps
	//    a future "make it consistent" change from silently disabling the critical-path gate for
	//    every derived app. Its behavior is owned by scripts/test-critical-path-budget.ts.
	assert(
		isFileExcluded(CRITICAL_PATH_FILE) && !isInitExcluded(CRITICAL_PATH_FILE),
		`${CRITICAL_PATH_FILE} must be app-owned generated state on the same terms as ${BUDGET_FILE}`,
	);
	const criticalPathShipped = JSON.parse(
		readFileSync(join(repoRoot, CRITICAL_PATH_FILE), 'utf-8'),
	) as Record<string, unknown>;
	assert(
		!('appSlug' in criticalPathShipped),
		`${CRITICAL_PATH_FILE} must not carry an appSlug — it is enforced for every app, not skipped`,
	);

	// 3. The template's committed budget carries provenance matching its own slug — otherwise the
	//    template would silently skip the very check it ships.
	const shipped = JSON.parse(readFileSync(join(repoRoot, BUDGET_FILE), 'utf-8')) as {
		appSlug?: unknown;
	};
	const defaults = JSON.parse(
		readFileSync(join(repoRoot, 'backend', 'src', 'config', 'defaults.json'), 'utf-8'),
	) as { app?: { slug?: string } };
	assert(
		typeof shipped.appSlug === 'string' && shipped.appSlug === defaults.app?.slug,
		`${BUDGET_FILE} must record appSlug '${String(defaults.app?.slug)}' from defaults.json`,
	);

	// 4. A budget this app owns is enforced: under budget passes, over budget fails and names both
	//    the measured size and the recorded budget.
	writeFixture({ appSlug: THIS_APP, maxCssBytes: 2048, maxJsBytes: 8192 });

	const withinBudget = evaluateAs(THIS_APP, 1024, 4096);
	assert(withinBudget.ok, 'A build inside its own recorded budget must pass');
	assert(
		textOf(withinBudget).includes('within budget'),
		'A passing budget check must report both bundles as within budget',
	);

	const overBudget = evaluateAs(THIS_APP, 1024, 9000);
	assert(!overBudget.ok, 'A build exceeding its own recorded budget must fail');
	const overText = textOf(overBudget);
	assert(
		overText.includes(kb(9000)) && overText.includes(kb(8192)),
		`The failure must name the measured size (${kb(9000)}) and the recorded budget (${kb(8192)})`,
	);
	assert(
		overText.includes('--update-budget'),
		'The failure must tell the operator how to regenerate an intentionally grown budget',
	);

	const cssOverBudget = evaluateAs(THIS_APP, 3000, 4096);
	assert(!cssOverBudget.ok, 'A CSS bundle exceeding its own recorded budget must fail');
	assert(
		textOf(cssOverBudget).includes(kb(2048)),
		`The CSS failure must name the recorded budget (${kb(2048)})`,
	);

	// 5. A budget belonging to another app is not this app's budget: skip, and say so. Without this
	//    branch a freshly scaffolded app is judged against the template's bundle in silence.
	const foreign = evaluateAs(OTHER_APP, 1024, 9000);
	assert(foreign.ok, "Another app's budget must not fail this app's build");
	const foreignText = textOf(foreign);
	assert(
		foreignText.includes(`'${THIS_APP}'`) && foreignText.includes(`'${OTHER_APP}'`),
		'The provenance skip must name both the recorded app and the app being measured',
	);
	assert(
		foreignText.includes('skipped') && foreignText.includes('--update-budget'),
		'The provenance skip must say the check was skipped and how to regenerate',
	);

	// 6. A budget predating provenance (no appSlug at all) is treated the same way.
	writeFixture({ maxCssBytes: 2048, maxJsBytes: 8192 });
	const unstamped = evaluateAs(THIS_APP, 1024, 9000);
	assert(unstamped.ok, 'An unstamped budget must not fail the build it cannot be attributed to');
	assert(
		textOf(unstamped).includes('no appSlug') && textOf(unstamped).includes('--update-budget'),
		'An unstamped budget must be reported as unattributable and point at --update-budget',
	);

	// 7. Regeneration stamps provenance and applies headroom, and the result is immediately
	//    enforceable — this is the path a freshly scaffolded app takes.
	const written = writeBundleBudget({
		appSlug: OTHER_APP,
		budgetPath,
		totalCssBytes: 1000,
		totalJsBytes: 2000,
	});
	assert(written.ok, 'Writing a budget must succeed');
	const regenerated = JSON.parse(readFileSync(budgetPath, 'utf-8')) as Record<string, unknown>;
	assert(
		regenerated['appSlug'] === OTHER_APP,
		'--update-budget must stamp the budget with the app it was measured from',
	);
	assert(
		regenerated['maxCssBytes'] === Math.ceil(1000 * BUDGET_HEADROOM) &&
			regenerated['maxJsBytes'] === Math.ceil(2000 * BUDGET_HEADROOM),
		`A regenerated budget must apply ${BUDGET_HEADROOM}x headroom to the measured totals`,
	);
	const afterRegen = evaluateAs(OTHER_APP, 1000, 2000);
	assert(
		afterRegen.ok && textOf(afterRegen).includes('within budget'),
		'A freshly regenerated budget must be enforced against the app that generated it',
	);
	const afterRegenOver = evaluateAs(OTHER_APP, 1000, 5000);
	assert(
		!afterRegenOver.ok,
		'A freshly regenerated budget must still fail a build that outgrows it',
	);

	// 8. Degenerate inputs: no budget file at all, and a budget with nothing to check.
	rmSync(budgetPath, { force: true });
	const missing = evaluateAs(THIS_APP, 1024, 9000);
	assert(missing.ok, 'A missing budget file must skip rather than fail');
	assert(
		textOf(missing).includes('Create one with'),
		'A missing budget file must tell the operator how to create one',
	);

	writeFixture({ appSlug: THIS_APP });
	const malformed = evaluateAs(THIS_APP, 1024, 9000);
	assert(!malformed.ok, 'A budget with no byte limits must fail rather than pass vacuously');

	console.log(`Bundle budget ownership regression test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
