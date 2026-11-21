/**
 * `bun run test`: every `test:` step of the full gate, once each, in qc order, on the current tree.
 *
 * The full gate's `qc.steps` in scripts/smokestack/smokestack.json is the only list. A test step
 * added there joins this run, and a derived app's own test steps run because they are in its
 * qc.steps. Tests that only other smoke modes run (the dev and preview auth-reset tests) are not in
 * qc.steps, so they are not here; check:gates-wired proves every test script is run or excused.
 *
 * A test that needs an earlier qc step to have run (a frontend build, say) names it in TEST_SETUP,
 * and that step runs where qc.steps runs it, exactly as the gate defines it. Nothing else in the
 * gate runs: no lint, typecheck, format, unrelated build, crawl or docker step. A setup step that
 * qc.steps does not run before its test fails the run before anything starts, naming it. So does
 * a test step whose `onlyIn` keeps it from running here: every selected test must execute.
 *
 * Started with git's hook variables for a repository (GIT_DIR, GIT_INDEX_FILE and the rest), it
 * refuses before reading anything, naming them: a test that makes scratch repositories would
 * otherwise write into the real one. The gate restarts itself without them; this asks the caller.
 *
 * Nothing is replayed from the step cache and nothing is recorded in it. The run goes to the end,
 * prints each step's name and result, and names every step that failed or did not run. Exit codes
 * follow the gate's: 0 every step passed; 1 one failed or did not run; 2 the run could not start;
 * 130 it was interrupted.
 *
 * This is the full test run team rule R22 asks for on a spernakit merge that does not touch the
 * gate pipeline. A gate-pipeline merge still takes one full `bun run smoke:qc`.
 */
import { join } from 'node:path';
import { exit } from 'node:process';

import { readScripts } from './smokestack/lib/shared-core/targets.ts';
import { ConfigError } from './smokestack/lib/smokestack/config-read.ts';
import {
	type Config,
	readConfig,
	skipReason,
	type Step,
} from './smokestack/lib/smokestack/config.ts';
import { childEnv, gitHookEnvPresent } from './smokestack/lib/smokestack/env.ts';
import { GATE_MARK, type GateResult, runGate } from './smokestack/lib/smokestack/gate.ts';
import { heavyForRun } from './smokestack/lib/smokestack/heavy-config.ts';
import { standing } from './smokestack/lib/smokestack/preflight.ts';

const ROOT = join(import.meta.dir, '..');
const TEST_PREFIX = 'test:';
const EXIT_PASSED = 0;
const EXIT_FAILED = 1;
const EXIT_CANNOT_START = 2;
const EXIT_INTERRUPTED = 130;

/** The qc steps each test needs run before it. They run as qc.steps defines them. */
export const TEST_SETUP: Readonly<Record<string, readonly string[]>> = {
	// It serves frontend/dist and checks the browser fingerprint that step records.
	'test:regression-suite': ['build', 'regression:fingerprint'],
};

export type Selection =
	| { kind: 'ready'; setup: number; steps: Step[]; tests: number }
	| { kind: 'unmet'; reasons: string[] };

/** Why `name`, set up for the test at `testAt`, cannot run before it, or null when it can. */
function unmetSetup(
	qc: Step[],
	name: string,
	testAt: number,
	packageName: null | string,
): null | string {
	const at = qc.findIndex((step) => step.name === name);
	const step = qc[at];
	if (step === undefined) return `${name} is not in qc.steps`;
	if (at > testAt) return `qc.steps runs ${name} after it`;
	const skip = skipReason(step, packageName);
	return skip === null ? null : `${name} does not run here (${skip})`;
}

interface SelectionContext {
	needed: Set<string>;
	packageName: null | string;
	qc: Step[];
	setup: Readonly<Record<string, readonly string[]>>;
}

/** Why the test at `testAt` cannot run here as selected; its setup is added to `ctx.needed`. */
function refusalsFor(ctx: SelectionContext, testAt: number, test: Step): string[] {
	const skip = skipReason(test, ctx.packageName);
	if (skip !== null) return [`${test.name} does not run here (${skip}), and every test must run`];
	const reasons: string[] = [];
	for (const name of ctx.setup[test.name] ?? []) {
		const unmet = unmetSetup(ctx.qc, name, testAt, ctx.packageName);
		if (unmet === null) ctx.needed.add(name);
		else reasons.push(`${test.name} needs ${name}, but ${unmet}`);
	}
	return reasons;
}

/** The steps `bun run test` runs: the test steps of `qc` and the setup they need, in qc order. */
export function selectTestRun(
	qc: Step[],
	packageName: null | string,
	setup: Readonly<Record<string, readonly string[]>> = TEST_SETUP,
): Selection {
	const needed = new Set<string>();
	const ctx = { needed, packageName, qc, setup };
	const reasons = [...qc.entries()]
		.filter(([, test]) => test.name.startsWith(TEST_PREFIX))
		.flatMap(([testAt, test]) => refusalsFor(ctx, testAt, test));
	if (reasons.length > 0) return { kind: 'unmet', reasons };
	const steps = qc.filter((step) => step.name.startsWith(TEST_PREFIX) || needed.has(step.name));
	return { kind: 'ready', setup: needed.size, steps, tests: steps.length - needed.size };
}

/** Prints the verdict, naming every step that failed or did not run, and returns the exit code. */
export function reportTestRun(
	steps: Step[],
	result: GateResult,
	packageName: null | string,
): number {
	// Selection refuses a step that would be skipped, so a skip here is a step that did not run.
	const skipped = steps.filter((step) => skipReason(step, packageName) !== null);
	const unreached = steps.slice(steps.length - result.notRun);
	const notRun = [...skipped, ...unreached].map((step) => step.name);
	const counts =
		`${result.selected} selected, ${result.passed} passed, ` +
		`${result.failures.length} failed, ${notRun.length} not run`;
	const clean = result.failures.length === 0 && notRun.length === 0 && !result.interrupted;
	if (clean) {
		console.info(`bun run test passed: ${counts}`);
		return EXIT_PASSED;
	}
	console.error(`bun run test ${result.interrupted ? 'INTERRUPTED' : 'FAILED'}: ${counts}`);
	for (const failure of result.failures) {
		console.error(`  [FAIL] ${failure.name} (${failure.detail})`);
	}
	for (const name of notRun) console.error(`  [NOT RUN] ${name}`);
	return result.interrupted ? EXIT_INTERRUPTED : EXIT_FAILED;
}

/** Runs `steps` in `root` with no step cache, as the full gate would run them. */
export async function runSelected(
	root: string,
	steps: Step[],
	options: { config: Config; signal: AbortSignal },
): Promise<number> {
	let stand: ReturnType<typeof standing>;
	try {
		stand = standing(root, 'qc');
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		console.error(
			`[FAIL] bun run test cannot check this repository against its lock: ${reason}`,
		);
		return EXIT_CANNOT_START;
	}
	if (stand.state === 'refused') {
		console.error(`[FAIL] bun run test will not start: ${stand.reason}.`);
		return EXIT_CANNOT_START;
	}
	const { config, signal } = options;
	const count = steps.filter((step) => step.heavy).length;
	const heavy = heavyForRun(config.heavy, count, process.env);
	if (heavy === null) return EXIT_CANNOT_START;
	process.env[GATE_MARK] = '1';
	const env = childEnv(config.env);
	const { packageName } = config;
	const { preflight } = stand;
	const run = { cache: null, env, heavy, mode: 'qc' as const, packageName, preflight };
	const result = await runGate({ ...run, root, signal, steps });
	return reportTestRun(steps, result, packageName);
}

async function main(signal: AbortSignal): Promise<number> {
	const hookEnv = gitHookEnvPresent();
	if (hookEnv.length > 0) {
		console.error(
			`[FAIL] bun run test will not start with git's hook variables set (${hookEnv.join(', ')}); ` +
				'run it from a shell without them.',
		);
		return EXIT_CANNOT_START;
	}
	if (process.env[GATE_MARK] !== undefined) {
		console.error('[FAIL] bun run test will not start inside a running gate.');
		return EXIT_CANNOT_START;
	}
	let config: Config;
	try {
		config = readConfig(ROOT, readScripts(ROOT));
	} catch (err) {
		if (!(err instanceof ConfigError)) throw err;
		console.error(`[FAIL] ${err.message}`);
		return EXIT_CANNOT_START;
	}
	const selection = selectTestRun(config.qc, config.packageName);
	if (selection.kind === 'unmet') {
		for (const reason of selection.reasons) console.error(`[FAIL] ${reason}`);
		return EXIT_CANNOT_START;
	}
	const { setup, steps, tests } = selection;
	console.info(`bun run test: ${tests} test step(s) and ${setup} setup step(s), none replayed`);
	return runSelected(ROOT, steps, { config, signal });
}

if (import.meta.main) {
	const stop = new AbortController();
	for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
		process.on(name, () => {
			stop.abort();
		});
	}
	exit(await main(stop.signal));
}
