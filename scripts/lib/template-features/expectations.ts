/**
 * The half of the self-test that grades a PLAN rather than a write.
 *
 * `scripts/test-template-features.ts` runs the shipped CLI in sequence — plan, refuse, write, re-plan
 * — and the file is over the 300-line limit with all of it inline. The classification table and the
 * milestone ladder are the part that reads as a specification rather than as a script, so they live
 * here; the assertion counter lives here too so the driver can report one total.
 */
import { assert, assertionCount } from './assert.ts';
import {
	DURABLE_DIRS,
	readJson,
	removePath,
	runSync,
	type SyncRun,
	TEMPLATE_VERSION,
	writeJson,
} from './fixture.ts';

export interface PlanEntry {
	action: string;
	changedFields: string[];
	dirName: string;
	lossFields: string[];
	milestone?: string;
	milestoneRung?: string;
	reason?: string;
}

export interface PlanJson {
	durable: number;
	entries: PlanEntry[];
	errors: string[];
	roadmapChanged: boolean;
}

export interface Roadmap {
	features: Record<string, { dependencies?: string[]; milestone?: string } | undefined>;
	milestones: Record<string, unknown>;
}

/** The gates the sync runs on its source print first, so the plan is the tail of stdout. */
export function parsePlan(stdout: string): PlanJson {
	const at = stdout.search(/^\{$/m);
	if (at < 0) throw new Error(`No JSON plan in output:\n${stdout}`);
	return JSON.parse(stdout.slice(at)) as PlanJson;
}

/** One row per classification-table case, all reachable in the same corpus. */
const EXPECTED_ACTIONS: Readonly<Record<string, string>> = {
	'alpha-feature': 'added',
	'audit-logs': 'unchanged',
	'beta-feature': 'updated',
	'delta-feature': 'unchanged',
	'epsilon-feature': 'unchanged',
	'eta-feature': 'adopted-with-loss',
	'gamma-feature': 'unchanged',
	'iota-feature': 'added',
	'remediation-20991231-probe': 'pruned',
	'stale-blocked-copy': 'prune-blocked',
	'stale-template-copy': 'pruned',
	'theta-feature': 'added',
	'zeta-feature': 'adopted',
};

/**
 * Directories the plan must not mention at all.
 *
 * `audit-change-history` and `audit-perf-…` sit either side of the `EPHEMERAL` boundary, which is the
 * distinction the pattern exists to make: one is an app-owned capability record and the other is a
 * template process artifact. Asserting both in one plan is what stops a future widening of the
 * pattern from quietly proposing a capability record for deletion.
 */
const UNMENTIONED = [
	'app-only-feature',
	'audit-change-history',
	'audit-perf-1784357475-slow-queries',
];

function expectClassification(plan: PlanJson, byDir: Map<string, PlanEntry>, run: SyncRun): void {
	assert(
		plan.durable === DURABLE_DIRS.length,
		`Expected ${DURABLE_DIRS.length} durable records, got ${plan.durable}.`,
	);
	assert(plan.errors.length === 0, `Unexpected plan errors: ${plan.errors.join('; ')}`);
	assert(plan.roadmapChanged, 'The roadmap merge must report a change.');

	for (const [dirName, expected] of Object.entries(EXPECTED_ACTIONS)) {
		const actual = byDir.get(dirName)?.action ?? 'absent';
		assert(
			actual === expected,
			`${dirName} should be '${expected}', got '${actual}':\n${run.text}`,
		);
	}
	for (const dirName of UNMENTIONED) {
		assert(
			!byDir.has(dirName),
			`${dirName} must not appear in the plan at all:\n${run.stdout}`,
		);
	}

	assert(
		Bun.deepEquals(byDir.get('beta-feature')?.lossFields, ['spec']),
		'An overwritten spec must be reported as app text at risk.',
	);
	assert(
		byDir.get('eta-feature')?.reason?.includes('refused without --adopt') === true,
		'A lossy adoption must be refused by default and say so.',
	);
	assert(
		Bun.deepEquals(byDir.get('zeta-feature')?.changedFields, ['spernakit_version']),
		'An unmarked copy with equal text differs only in its marker.',
	);
}

function expectMilestoneLadder(byDir: Map<string, PlanEntry>): void {
	const rung = (dirName: string): string =>
		`${String(byDir.get(dirName)?.milestone)}/${String(byDir.get(dirName)?.milestoneRung)}`;

	assert(rung('iota-feature') === 'polish/exact', `Exact rung: got ${rung('iota-feature')}`);
	assert(
		rung('alpha-feature') === 'mvp-foundation/priority',
		`Priority rung: got ${rung('alpha-feature')}`,
	);
	assert(
		rung('theta-feature') === 'polish/current',
		`Current rung: got ${rung('theta-feature')}`,
	);
	assert(
		byDir.get('beta-feature')?.milestone === undefined,
		'An existing roadmap entry keeps its own milestone and needs no resolution.',
	);
}

/** The report is graded on its text because the loss remedy is only read at the moment of loss. */
function expectReport(templateRoot: string, appRoot: string): void {
	const run = runSync(templateRoot, ['--app', appRoot, '--check']);
	assert(run.exitCode === 1, `--check must exit 1 on a drifted app:\n${run.text}`);
	for (const needle of [
		'ADOPTED WITH LOSS',
		'PRUNE BLOCKED',
		'APP TEXT AT RISK',
		'DEVIATES:',
		'milestone: polish [current]',
	]) {
		assert(run.text.includes(needle), `The report must mention '${needle}':\n${run.text}`);
	}
}

/** Plan the untouched fixture and grade every classification and ladder rule it produces. */
export function expectInitialPlan(templateRoot: string, appRoot: string): void {
	const run = runSync(templateRoot, ['--app', appRoot, '--check', '--json']);
	// `--check` means the same thing in both renderings. A machine-readable plan that reports drift
	// and exits 0 is the one output a pipeline would gate on and never trip.
	assert(run.exitCode === 1, `--check --json must exit 1 on a drifted app:\n${run.text}`);

	const plan = parsePlan(run.stdout);
	const byDir = new Map(plan.entries.map((entry) => [entry.dirName, entry]));
	expectClassification(plan, byDir, run);
	expectMilestoneLadder(byDir);
	expectReport(templateRoot, appRoot);
}

const BETA = '.aidd/features/beta-feature/feature.json';
const APP_BETA_SPEC = ['Spec line one.', 'Spec line two, edited by the app.'];

/**
 * The write, in the two runs an operator actually performs.
 *
 * The first must refuse the one record whose overwrite destroys app-authored text and still apply
 * everything else — a sync that stopped dead would leave the app half-synced with no way forward,
 * and one that wrote through would report the loss immediately after causing it. Only the second,
 * explicitly flagged, discards the app's text. Leaves the fixture fully written.
 */
export function expectGuardedWrite(templateRoot: string, appRoot: string): void {
	let run = runSync(templateRoot, ['--app', appRoot, '--adopt']);
	assert(run.exitCode === 1, `A write with app text at risk must exit 1:\n${run.text}`);
	assert(
		run.text.includes('NOT OVERWRITTEN') && run.text.includes('beta-feature'),
		`The refusal must name the record it declined to write:\n${run.text}`,
	);
	assert(
		Bun.deepEquals(readJson(appRoot, BETA)['spec'], APP_BETA_SPEC),
		'A refused record must be left exactly as the app had it.',
	);
	assert(
		readJson(appRoot, '.aidd/features/alpha-feature/feature.json')['id'] === 'alpha-feature',
		'The rest of the plan must be applied in the same run.',
	);

	run = runSync(templateRoot, ['--app', appRoot, '--adopt', '--overwrite-app-text']);
	assert(run.exitCode === 0, `The flagged write run must succeed:\n${run.text}`);
}

const PROBE = 'remediation-20991231-probe';
const GAMMA = '.aidd/features/gamma-feature/feature.json';

/** The leak half: a process record resident in an app is wrong at every version, template or not. */
function expectLeakedRecordFails(templateRoot: string, appRoot: string): void {
	writeJson(appRoot, `.aidd/features/${PROBE}/feature.json`, {
		id: PROBE,
		spernakit_version: TEMPLATE_VERSION,
	});

	let run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('wrong at any template version'),
		`A leaked process record must fail the app:\n${run.text}`,
	);
	assert(run.text.includes(PROBE), `The failure must name the record:\n${run.text}`);

	// The reason this tier exists: at a skew the content gate skips, and the leak must still fail.
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: '9.1.0' });
	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && !run.text.includes('SKIPPED'),
		`A version skew must not hide a leaked record behind the parity skip:\n${run.text}`,
	);
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });

	// And it needs no template checkout at all, unlike every other comparison the tool makes.
	run = runSync(appRoot, ['--template', `${appRoot}/absent-template`, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes(PROBE),
		`An unresolvable template must not hide a leaked record either:\n${run.text}`,
	);

	removePath(appRoot, `.aidd/features/${PROBE}`);
}

/**
 * The two version-independent defects, checked ahead of every skip. Expects a fully-synced app at
 * parity, and leaves it in that state.
 */
export function expectResidentTier(templateRoot: string, appRoot: string): void {
	expectLeakedRecordFails(templateRoot, appRoot);

	// `spernakit_version` marks the version that introduced a record and is never bumped on
	// revision, so a value the template does not carry can only have been typed by hand.
	const gamma = readJson(appRoot, GAMMA);
	writeJson(appRoot, GAMMA, { ...gamma, spernakit_version: '8.0.0' });
	let run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('spernakit_version is 8.0.0'),
		`A hand-edited stamp must fail and print both values:\n${run.text}`,
	);
	writeJson(appRoot, GAMMA, gamma);

	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(run.exitCode === 0, `Restoring the record must return the app to green:\n${run.text}`);
}

export { assert, assertionCount };
