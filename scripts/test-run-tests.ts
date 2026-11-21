/**
 * Proves `bun run test` (scripts/run-tests.ts) selects every test step of qc.steps and only the
 * setup they name, refuses a setup step it cannot meet, replays nothing from the step cache, runs to
 * the end, and names each step that failed or did not run.
 *
 * Record: .aidd/features/test-script-runs-every-test.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { GateResult } from './smokestack/lib/smokestack/gate.ts';

import { reportTestRun, runSelected, selectTestRun, TEST_SETUP } from './run-tests.ts';
import { readScripts } from './smokestack/lib/shared-core/targets.ts';
import { parseStepCache } from './smokestack/lib/smokestack/cache-config.ts';
import { readConfig, type Step } from './smokestack/lib/smokestack/config.ts';
import { withoutNames } from './smokestack/lib/smokestack/env.ts';
import { GATE_MARK } from './smokestack/lib/smokestack/gate.ts';

const root = resolve(import.meta.dir, '..');
const failures: string[] = [];

function check(ok: boolean, what: string): void {
	console.log(`${ok ? '[OK]' : '[FAIL]'} ${what}`);
	if (!ok) failures.push(what);
}

function step(name: string, extra: Partial<Step> = {}): Step {
	return { cache: null, description: name, heavy: false, name, onlyIn: null, run: [], ...extra };
}

function names(selection: ReturnType<typeof selectTestRun>): string {
	return selection.kind === 'ready' ? selection.steps.map((s) => s.name).join(',') : 'unmet';
}

function reasons(selection: ReturnType<typeof selectTestRun>): string {
	return selection.kind === 'unmet' ? selection.reasons.join('; ') : '';
}

function selectionCases(): void {
	const qc = ['check:a', 'build', 'test:x', 'lint', 'test:needs', 'format:check'].map((n) =>
		step(n),
	);
	const setup = { 'test:needs': ['build'] };
	const picked = selectTestRun(qc, 'app', setup);
	check(
		names(picked) === 'build,test:x,test:needs',
		'selects the tests and their setup in order',
	);
	const late = selectTestRun([step('test:needs'), step('build')], 'app', setup);
	check(reasons(late).includes('runs build after it'), 'refuses setup that runs after its test');
	const absent = selectTestRun([step('test:needs')], 'app', setup);
	check(reasons(absent).includes('build is not in qc.steps'), 'refuses setup qc.steps lacks');
	const elsewhere = [step('build', { onlyIn: 'other' }), step('test:needs')];
	const skippedSetup = selectTestRun(elsewhere, 'app', setup);
	check(reasons(skippedSetup).includes('does not run here'), 'refuses setup skipped here');
	const skippedTest = selectTestRun([step('test:x', { onlyIn: 'other' })], 'app', setup);
	const refused = reasons(skippedTest);
	check(refused.includes('test:x does not run here'), 'refuses a test skipped here, naming it');
	const ownTest = selectTestRun([step('test:x', { onlyIn: 'app' })], 'app', setup);
	check(names(ownTest) === 'test:x', 'selects a test whose onlyIn names this repository');
}

function realConfigCase(): void {
	const config = readConfig(root, readScripts(root));
	const selection = selectTestRun(config.qc, config.packageName);
	check(selection.kind === 'ready', `the real qc.steps can run (${reasons(selection)})`);
	if (selection.kind !== 'ready') return;
	const tests = config.qc.filter((s) => s.name.startsWith('test:')).map((s) => s.name);
	const picked = selection.steps.map((s) => s.name);
	const extra = picked.filter((name) => !name.startsWith('test:'));
	check(
		tests.every((name) => picked.includes(name)),
		`all ${tests.length} qc test steps run`,
	);
	const wanted = [...new Set(Object.values(TEST_SETUP).flat())].sort();
	check(extra.sort().join(',') === wanted.join(','), `only the named setup runs (${extra})`);
}

function resultCases(): void {
	const steps = ['test:a', 'test:b', 'test:c'].map((n) => step(n));
	const base: GateResult = {
		failures: [],
		interrupted: false,
		notRun: 0,
		passed: 3,
		replayed: 0,
		selected: 3,
		skipped: 0,
	};
	check(reportTestRun(steps, base, 'app') === 0, 'a clean run exits 0');
	const failed = { ...base, failures: [{ detail: 'exit 1', name: 'test:b' }], passed: 2 };
	check(reportTestRun(steps, failed, 'app') === 1, 'a failed test exits 1');
	const stopped = { ...base, interrupted: true, notRun: 2, passed: 1 };
	check(reportTestRun(steps, stopped, 'app') === 130, 'an interrupted run exits 130');
	const withSkip = [...steps, step('test:d', { onlyIn: 'other' })];
	const skipped = { ...base, selected: 4, skipped: 1 };
	check(reportTestRun(withSkip, skipped, 'app') === 1, 'a skipped step fails the run');
}

/** The CLI refuses git's hook variables before it reads, checks or starts anything. */
function hookEnvCase(): void {
	const given = withoutNames(process.env, [GATE_MARK], process.platform === 'win32');
	const env = { ...given, GIT_INDEX_FILE: join(tmpdir(), 'run-tests-no-such-index') };
	const ran = Bun.spawnSync(['bun', join(root, 'scripts', 'run-tests.ts')], {
		cwd: root,
		env,
		stderr: 'pipe',
		stdout: 'pipe',
		// A refusal takes a second or two; should the guard ever break, the whole run is cut short.
		timeout: 60_000,
		windowsHide: true,
	});
	const said = `${ran.stdout.toString()}${ran.stderr.toString()}`;
	check(ran.exitCode === 2, `the CLI exits 2 under a hook's GIT_INDEX_FILE (${ran.exitCode})`);
	check(said.includes('GIT_INDEX_FILE'), 'the refusal names the variable');
	check(
		!said.includes('==>') && !said.includes('shared files'),
		'nothing runs, not even preflight',
	);
}

async function runCase(): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'run-tests-'));
	try {
		const marker = join(dir, 'ran.txt');
		const writer = join(dir, 'mark.ts');
		const body = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\n`;
		writeFileSync(writer, body);
		const cache = parseStepCache({ inputs: ['package.json'] }, 'fixture');
		const steps = [
			step('test:fails', { run: ['bun', '-e', 'process.exit(3)'] }),
			step('test:cached', { cache, run: ['bun', writer] }),
		];
		const config = readConfig(root, readScripts(root));
		const signal = new AbortController().signal;
		const code = await runSelected(root, steps, { config, signal });
		check(code === 1, 'a failing test fails the run');
		check(existsSync(marker), 'the run goes on past a failure and runs a cached step');
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

selectionCases();
realConfigCase();
resultCases();
hookEnvCase();
await runCase();
if (failures.length > 0) {
	console.error(`[FAIL] test:run-tests -- ${failures.length} check(s) failed.`);
	process.exit(1);
}
console.log('[OK] test:run-tests -- bun run test selects, runs and reports as specified.');
