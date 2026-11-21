/**
 * The corpus test-template-features.ts runs the sync against: a template and a derived app whose
 * records and roadmaps exercise every row of the classification table in one run. Kept apart from
 * the harness in fixture.ts so each stays under the line cap; the content is unchanged.
 */
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

/** Raw ephemeral + TEMPLATE_PROCESS edges; neither may reach an app copy or its roadmap. */
const PROCESS_EDGES = ['delta-feature', 'remediation-20991231-probe', 'template-feature-sync'];

/**
 * `audit-logs` is durable despite its prefix and `remediation-20991231-probe` is not: telling
 * those apart is the entire job of the `EPHEMERAL` pattern, so both live in one corpus.
 * `theta-feature` carries `shippedVersion` upstream, which a new app copy must never inherit.
 * `template-feature-sync` is a real `TEMPLATE_PROCESS` member: exclusion, prune and dependency
 * filter all run against the shipped set; `gamma-feature` carries the raw process edges.
 */
export const TEMPLATE_FEATURES: Readonly<Record<string, Record_>> = {
	'alpha-feature': templateRecord('alpha-feature', { priority: 3 }),
	'audit-logs': templateRecord('audit-logs'),
	'audit-perf-1784357475-slow-queries': templateRecord('audit-perf-1784357475-slow-queries'),
	'beta-feature': templateRecord('beta-feature', {
		spec: ['Spec line one.', 'Spec line two.'],
	}),
	'delta-feature': templateRecord('delta-feature'),
	'epsilon-feature': templateRecord('epsilon-feature', { notes: ['Note one.', 'Note two.'] }),
	'eta-feature': templateRecord('eta-feature', { spec: ['Eta spec line.'] }),
	'gamma-feature': templateRecord('gamma-feature', { dependencies: PROCESS_EDGES }),
	'iota-feature': templateRecord('iota-feature'),
	'remediation-20991231-probe': templateRecord('remediation-20991231-probe'),
	'template-feature-sync': templateRecord('template-feature-sync'),
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
export const APP_FEATURES: Readonly<Record<string, Record_>> = {
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
	'gamma-feature': appCopy('gamma-feature', { dependencies: PROCESS_EDGES }),
	'remediation-20991231-probe': appCopy('remediation-20991231-probe'),
	'stale-blocked-copy': appOwned('stale-blocked-copy', { spernakit_version: '8.0.0' }),
	'stale-template-copy': appOwned('stale-template-copy', { spernakit_version: '8.0.0' }),
	'template-feature-sync': appCopy('template-feature-sync'),
	'zeta-feature': unmarked(appCopy('zeta-feature')),
};

export const TEMPLATE_ROADMAP = {
	features: {
		'alpha-feature': {
			// The ephemeral edge must be dropped on the way down: a capability never depends on a
			// finding, and the app has no such directory to resolve it against.
			dependencies: ['gamma-feature', 'remediation-20991231-probe'],
			milestone: 'MVP',
		},
		'audit-logs': { milestone: 'MVP' },
		'audit-perf-1784357475-slow-queries': { milestone: 'MVP' },
		'beta-feature': {
			dependencies: ['alpha-feature', 'template-feature-sync'],
			milestone: 'MVP',
		},
		'delta-feature': { milestone: 'MVP' },
		'epsilon-feature': { milestone: 'MVP' },
		'eta-feature': { milestone: 'MVP' },
		'gamma-feature': { milestone: 'MVP' },
		'iota-feature': { milestone: 'polish' },
		'remediation-20991231-probe': { milestone: 'MVP' },
		'template-feature-sync': { milestone: 'MVP' },
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
export const APP_ROADMAP = {
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
		'template-feature-sync': { milestone: 'mvp-foundation' },
		'zeta-feature': { milestone: 'mvp-foundation' },
	},
	milestones: {
		'mvp-foundation': { description: 'App foundation.', priority: 1 },
		polish: { description: 'App polish.', priority: 2 },
	},
};
