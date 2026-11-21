/**
 * Proves that each cached step keys the files it reads at run time, which no import follower can
 * see: the public assets the build copies, the documents and assertions the checks read, the
 * licence material the licence gate reads, and the migration files the in-process gates apply.
 *
 * It asks the active runner's own parseStepCache and collectInputs, so it measures exactly what a
 * smoke:qc run would key. A step that is missing, not cached, or cannot be keyed is a failure, never
 * a pass (Roger #61186). Run with a config path to check another smokestack.json, which is how the
 * before-change control is taken.
 *
 * Record: .aidd/features/smoke-cache-step-keys-omit-read-inputs, REVIEW CORRECTION 2026-11-21.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseStepCache } from './smokestack/lib/smokestack/cache-config.ts';
import { collectInputs } from './smokestack/lib/smokestack/cache-inputs.ts';

const root = resolve(import.meta.dir, '..');
const configPath = process.argv[2] ?? join(root, 'scripts/smokestack/smokestack.json');

const journal = 'backend/drizzle/meta/_journal.json';
const entries = (
	JSON.parse(readFileSync(join(root, journal), 'utf8')) as { entries: { tag: string }[] }
).entries;
const newest = entries.at(-1)?.tag;
if (!newest) throw new Error(`${journal} lists no migrations`);
const migrations = [journal, `backend/drizzle/${newest}.sql`];

/** The migrating gates whose keys omitted the migration files (probe of 2026-11-21). */
const MIGRATING = [
	'test:api-key-request-signing',
	'test:audit-outcome-filter',
	'test:auth-before-validation',
	'test:auth-rate-limit-state',
	'test:bug-report-whitespace',
	'test:dashboard-share-revoke',
	'test:onboarding-password-step',
	'test:security-fixes',
	'test:step-up-password-message',
	'test:username-parity',
];

// .aidd is never tracked, so .aidd/assertions.md exists only where a checkout has one; the collector
// keys a declared file only when it exists. The repository check therefore asks for it only when
// it is present, and gateConventionsFixture() below proves the declaration on a fixture root, in
// every checkout.
const ASSERTIONS = '.aidd/assertions.md';
const hasAssertions = existsSync(join(root, ASSERTIONS));

const EXPECTED: Record<string, string[]> = {
	build: ['frontend/public/og-image.svg'],
	'check:gate-conventions': hasAssertions ? [ASSERTIONS] : [],
	'check:licenses': ['Dockerfile', 'licenses/GPL-3.0.txt', '.prettierrc'],
	'check:version-refs': ['docs/template/STACK.md'],
	...Object.fromEntries(MIGRATING.map((name) => [name, migrations])),
};

interface Step {
	cache?: unknown;
	name: string;
}

const config = JSON.parse(readFileSync(configPath, 'utf8')) as { qc: { steps: Step[] } };
const failures: string[] = [];

for (const [name, files] of Object.entries(EXPECTED)) {
	const step = config.qc.steps.find((s) => s.name === name);
	if (!step) {
		failures.push(`${name}: no such qc step`);
		continue;
	}
	let keyed: string[];
	try {
		const spec = parseStepCache(step.cache, name);
		if (spec.state !== 'cached') {
			failures.push(
				`${name}: not a cached step (${spec.state}), so its key cannot be checked`,
			);
			continue;
		}
		keyed = await collectInputs(root, spec, new Map());
	} catch (err) {
		failures.push(`${name}: its inputs cannot be collected: ${(err as Error).message}`);
		continue;
	}
	const set = new Set(keyed);
	for (const file of files) if (!set.has(file)) failures.push(`${name}: does not key ${file}`);
	if (name === 'check:gate-conventions') {
		const extra = keyed.filter((f) => f.startsWith('.aidd/') && f !== ASSERTIONS);
		if (extra.length > 0) failures.push(`${name}: keys other .aidd files: ${extra.join(', ')}`);
	}
}

/**
 * The same collector over a fixture root holding .aidd/assertions.md and an unrelated .aidd file:
 * the step's cache block must key the first and not the second, whatever this checkout holds.
 */
async function gateConventionsFixture(): Promise<void> {
	const step = config.qc.steps.find((s) => s.name === 'check:gate-conventions');
	if (!step) return; // already reported as a missing step above
	const fixture = mkdtempSync(join(tmpdir(), 'runtime-cache-inputs-'));
	try {
		mkdirSync(join(fixture, '.aidd'));
		writeFileSync(join(fixture, ASSERTIONS), '# assertions\n');
		writeFileSync(join(fixture, '.aidd/unrelated.md'), '# not read by the gate\n');
		const spec = parseStepCache(step.cache, 'check:gate-conventions');
		if (spec.state !== 'cached') return; // already reported above
		const keyed = await collectInputs(fixture, spec, new Map());
		if (!keyed.includes(ASSERTIONS))
			failures.push(`check:gate-conventions: on a fixture root, does not key ${ASSERTIONS}`);
		if (keyed.includes('.aidd/unrelated.md'))
			failures.push(
				'check:gate-conventions: on a fixture root, keys an unrelated .aidd file',
			);
	} catch (err) {
		failures.push(
			`check:gate-conventions: fixture inputs cannot be collected: ${(err as Error).message}`,
		);
	} finally {
		rmSync(fixture, { force: true, recursive: true });
	}
}
await gateConventionsFixture();

if (failures.length > 0) {
	console.error(`[FAIL] runtime-cache-inputs (${configPath}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
const checked = Object.values(EXPECTED).reduce((n, files) => n + files.length, 0);
console.log(
	`[OK] runtime-cache-inputs: ${String(Object.keys(EXPECTED).length)} steps key all ${String(checked)} run-time files checked in this checkout (${hasAssertions ? `${ASSERTIONS} present` : `${ASSERTIONS} absent here`}), and on a fixture root check:gate-conventions keys ${ASSERTIONS} and no other .aidd file.`,
);
