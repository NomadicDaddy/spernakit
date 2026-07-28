/**
 * The fixture harness for `scripts/test-template-features.ts`.
 *
 * The sync's rules are only worth anything if the shipped CLI applies them, so the assertions grade
 * the real `scripts/sync-template-features.ts` on its exit code, its output and the bytes it leaves
 * on disk. That needs a real template repo and a real app directory, and the corpus has to be rich
 * enough to exercise every row of the classification table in a single run — otherwise a rule can
 * pass in isolation and still be unreachable in practice. That scaffolding lives here so the test
 * file holds assertions.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. The location is also load-bearing: writes go through Prettier with the config resolved
 * from the destination path, and only a fixture inside the repository resolves one. Callers must
 * invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execPath, env as processEnv } from 'node:process';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const CLI = join(REPO_ROOT, 'scripts', 'sync-template-features.ts');

export const TEMPLATE_VERSION = '9.0.0';

/** Template directories the sync must consider — everything that is not a process artifact. */
export const DURABLE_DIRS = [
	'alpha-feature',
	'audit-logs',
	'beta-feature',
	'delta-feature',
	'epsilon-feature',
	'eta-feature',
	'gamma-feature',
	'iota-feature',
	'theta-feature',
	'zeta-feature',
] as const;

type Record_ = Record<string, unknown>;

function templateRecord(id: string, extra: Record_ = {}): Record_ {
	return {
		category: 'infrastructure',
		createdAt: '2026-01-01T00:00:00.000Z',
		description: `Template description for ${id}.`,
		id,
		priority: 50,
		spernakit_version: TEMPLATE_VERSION,
		status: 'backlog',
		summary: `Summary for ${id}.`,
		title: id,
		updatedAt: '2026-01-01T00:00:00.000Z',
		...extra,
	};
}

/**
 * `audit-logs` is durable despite its prefix and `remediation-20991231-probe` is not: telling those
 * two apart is the entire job of the `EPHEMERAL` pattern, so both live in the same corpus.
 * `theta-feature` carries `shippedVersion` upstream, which a new app copy must never inherit.
 */
const TEMPLATE_FEATURES: Readonly<Record<string, Record_>> = {
	'alpha-feature': templateRecord('alpha-feature', { priority: 3 }),
	'audit-logs': templateRecord('audit-logs'),
	'audit-perf-1784357475-slow-queries': templateRecord('audit-perf-1784357475-slow-queries'),
	'beta-feature': templateRecord('beta-feature', {
		spec: ['Spec line one.', 'Spec line two.'],
	}),
	'delta-feature': templateRecord('delta-feature'),
	'epsilon-feature': templateRecord('epsilon-feature', { notes: ['Note one.', 'Note two.'] }),
	'eta-feature': templateRecord('eta-feature', { spec: ['Eta spec line.'] }),
	'gamma-feature': templateRecord('gamma-feature'),
	'iota-feature': templateRecord('iota-feature'),
	'remediation-20991231-probe': templateRecord('remediation-20991231-probe'),
	'theta-feature': templateRecord('theta-feature', { shippedVersion: '9.0.0' }),
	'zeta-feature': templateRecord('zeta-feature'),
};

function appCopy(dirName: string, extra: Record_ = {}): Record_ {
	return { ...TEMPLATE_FEATURES[dirName], ...extra };
}

function unmarked(record: Record_): Record_ {
	const copy = { ...record };
	delete copy['spernakit_version'];
	return copy;
}

function appOwned(id: string, extra: Record_ = {}): Record_ {
	return {
		category: 'feature',
		createdAt: '2026-02-02T00:00:00.000Z',
		description: `App-authored ${id}.`,
		id,
		priority: 20,
		status: 'backlog',
		title: id,
		updatedAt: '2026-02-02T00:00:00.000Z',
		...extra,
	};
}

/**
 * The app copies, one per classification row.
 *
 * `beta-feature` diverges in `spec` and carries app-local `priority`/`shippedVersion` that must
 * survive the overwrite. `delta-feature` differs only in `updatedAt` and `epsilon-feature` only in
 * how `notes` is serialized — both must read as `unchanged`, which is what makes the sync idempotent.
 * `zeta-feature` and `eta-feature` are the unmarked Phase-9a-era copies: identical text is adopted,
 * diverged text is refused without `--adopt`.
 */
const APP_FEATURES: Readonly<Record<string, Record_>> = {
	'app-only-feature': appOwned('app-only-feature'),
	'audit-change-history': appOwned('audit-change-history'),
	'audit-logs': appCopy('audit-logs'),
	'beta-feature': appCopy('beta-feature', {
		priority: 7,
		shippedVersion: '1.2.0',
		spec: ['Spec line one.', 'Spec line two, edited by the app.'],
		updatedAt: '2026-05-05T00:00:00.000Z',
	}),
	'delta-feature': appCopy('delta-feature', { updatedAt: '2026-05-05T00:00:00.000Z' }),
	'epsilon-feature': appCopy('epsilon-feature', { notes: 'Note one.\nNote two.' }),
	'eta-feature': unmarked(
		appCopy('eta-feature', { spec: ['Eta spec line, edited by the app.'] }),
	),
	'gamma-feature': appCopy('gamma-feature'),
	'remediation-20991231-probe': appCopy('remediation-20991231-probe'),
	'stale-blocked-copy': appOwned('stale-blocked-copy', { spernakit_version: '8.0.0' }),
	'stale-template-copy': appOwned('stale-template-copy', { spernakit_version: '8.0.0' }),
	'zeta-feature': unmarked(appCopy('zeta-feature')),
};

const TEMPLATE_ROADMAP = {
	features: {
		'alpha-feature': {
			// The ephemeral edge must be dropped on the way down: a capability never depends on a
			// finding, and the app has no such directory to resolve it against.
			dependencies: ['gamma-feature', 'remediation-20991231-probe'],
			milestone: 'MVP',
		},
		'audit-logs': { milestone: 'MVP' },
		'audit-perf-1784357475-slow-queries': { milestone: 'MVP' },
		'beta-feature': { dependencies: ['alpha-feature'], milestone: 'MVP' },
		'delta-feature': { milestone: 'MVP' },
		'epsilon-feature': { milestone: 'MVP' },
		'eta-feature': { milestone: 'MVP' },
		'gamma-feature': { milestone: 'MVP' },
		'iota-feature': { milestone: 'polish' },
		'remediation-20991231-probe': { milestone: 'MVP' },
		'theta-feature': { milestone: 'Enhancement' },
		'zeta-feature': { milestone: 'MVP' },
	},
	milestones: {
		Enhancement: { description: 'Template enhancement work.', priority: 3 },
		MVP: { description: 'Template MVP.', priority: 1 },
		polish: { description: 'Template polish.', priority: 5 },
	},
};

/**
 * The app's milestone vocabulary deliberately overlaps the template's only partially, so one run
 * exercises all three rungs of the ladder: `polish` matches by name (exact), `mvp-foundation` is the
 * only milestone at the template's `MVP` priority (priority), and nothing sits at `Enhancement`'s
 * priority so the highest-numbered app milestone wins (current).
 */
const APP_ROADMAP = {
	features: {
		'app-only-feature': { milestone: 'polish' },
		'audit-change-history': { milestone: 'polish' },
		'audit-logs': { milestone: 'mvp-foundation' },
		'beta-feature': { dependencies: [], milestone: 'polish' },
		'delta-feature': { milestone: 'mvp-foundation' },
		'epsilon-feature': { milestone: 'mvp-foundation' },
		'eta-feature': { milestone: 'mvp-foundation' },
		'gamma-feature': { milestone: 'mvp-foundation' },
		'remediation-20991231-probe': { milestone: 'mvp-foundation' },
		'stale-blocked-copy': { milestone: 'mvp-foundation' },
		'stale-template-copy': { milestone: 'mvp-foundation' },
		'zeta-feature': { milestone: 'mvp-foundation' },
	},
	milestones: {
		'mvp-foundation': { description: 'App foundation.', priority: 1 },
		polish: { description: 'App polish.', priority: 2 },
	},
};

export interface SyncRun {
	exitCode: number;
	/** stdout only, so `--json` output can be parsed without stderr spliced into it. */
	stdout: string;
	/** stdout and stderr together, for message assertions. */
	text: string;
}

export function scratchDir(prefix: string): string {
	const parent = join(REPO_ROOT, 'tmp');
	mkdirSync(parent, { recursive: true });
	return mkdtempSync(join(parent, prefix));
}

export function writeText(root: string, relPath: string, content: string): void {
	const target = join(root, relPath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

export function writeJson(root: string, relPath: string, value: unknown): void {
	writeText(root, relPath, `${JSON.stringify(value, null, '\t')}\n`);
}

export function readText(root: string, relPath: string): null | string {
	try {
		return readFileSync(join(root, relPath), 'utf8');
	} catch {
		return null;
	}
}

export function readJson(root: string, relPath: string): Record<string, unknown> {
	const raw = readText(root, relPath);
	if (raw === null) throw new Error(`${relPath} is missing under ${root}`);
	return JSON.parse(raw) as Record<string, unknown>;
}

export function removePath(root: string, relPath: string): void {
	rmSync(join(root, relPath), { force: true, recursive: true });
}

/** Run the shipped CLI from `cwdDir`. `bun` is taken from this process so PATH is irrelevant. */
export function runSync(
	cwdDir: string,
	args: string[],
	extraEnv: Record<string, string> = {},
): SyncRun {
	const result = Bun.spawnSync([execPath, CLI, ...args], {
		cwd: cwdDir,
		env: { ...processEnv, ...extraEnv },
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const stdout = result.stdout.toString();
	return { exitCode: result.exitCode, stdout, text: `${stdout}${result.stderr.toString()}` };
}

export interface FeatureFixture {
	appRoot: string;
	cleanup: () => void;
	/** The scratch parent. Anything written under it is removed by `cleanup`. */
	root: string;
	templateRoot: string;
}

/** Build a spernakit-shaped template and a derived app at version parity with it. */
export function createFeatureFixture(): FeatureFixture {
	const root = scratchDir('template-features-');
	const templateRoot = join(root, 'template');
	const appRoot = join(root, 'app');

	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });
	// `resolveSpernakitPath` accepts a directory only when it looks like a git checkout; the sync
	// never shells out to git, so an empty directory is enough to satisfy that test.
	mkdirSync(join(templateRoot, '.git'), { recursive: true });
	for (const [dirName, record] of Object.entries(TEMPLATE_FEATURES)) {
		writeJson(templateRoot, `.aidd/features/${dirName}/feature.json`, record);
	}
	writeJson(templateRoot, '.aidd/roadmap.json', TEMPLATE_ROADMAP);

	writeJson(appRoot, 'package.json', {
		name: 'fixture-app',
		spernakit_version: TEMPLATE_VERSION,
		version: '0.1.0',
	});
	for (const [dirName, record] of Object.entries(APP_FEATURES)) {
		writeJson(appRoot, `.aidd/features/${dirName}/feature.json`, record);
	}
	// A second file is what separates `pruned` from `prune-blocked`: the sync deletes a directory
	// only when `feature.json` is all that would be lost.
	writeText(appRoot, '.aidd/features/stale-blocked-copy/NOTES.md', '# kept by hand\n');
	writeJson(appRoot, '.aidd/roadmap.json', APP_ROADMAP);

	return {
		appRoot,
		cleanup: () => rmSync(root, { force: true, recursive: true }),
		root,
		templateRoot,
	};
}
