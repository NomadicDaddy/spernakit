#!/usr/bin/env bun
/** Regression coverage for invocation-scoped cache-status reuse and ordered results. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	canSkipStep,
	getCacheStatus,
	recordStepResult,
	type SmokeCacheDiagnostics,
} from './smoke-cache.ts';

interface SmokeConfig {
	modes: { qc: { steps: { command: string }[] } };
}

function stepKey(command: string): string {
	return command.match(/bun run (\S+)/)?.[1] ?? command;
}

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

const projectRoot = join(import.meta.dir, '..');
const config = (await Bun.file(join(import.meta.dir, 'smoke.json')).json()) as SmokeConfig;
const steps = config.modes.qc.steps.map(({ command }) => stepKey(command));

// The status path only hashes files for steps with a recorded pass to verify. A cold cache
// (a fresh CI runner restoring a per-commit smoke cache) has none. Seed one recorded pass
// into a DISPOSABLE fixture cache file, never the live project cache the runner reads: a
// manufactured pass must not be able to satisfy a real check, and the live cache must not
// move while this regression runs (Roger 4b5097b7).
const fixtureDir = mkdtempSync(join(tmpdir(), 'spernakit-cache-status-'));
const seededCache = join(fixtureDir, 'seeded', 'smoke-cache.json');
const emptyCache = join(fixtureDir, 'empty', 'smoke-cache.json');
const liveCache = join(projectRoot, 'scripts', 'smoke-cache.json');
const liveBefore = existsSafeBytes(liveCache);

try {
	const seedStep = steps.find((step) => step === 'check-deps');
	if (seedStep)
		await recordStepResult(projectRoot, seedStep, 'pass', 1, { cachePath: seededCache });

	const serial: Awaited<ReturnType<typeof canSkipStep>>[] = [];
	for (const step of steps)
		serial.push(await canSkipStep(projectRoot, step, { cachePath: seededCache }));

	const diagnostics: SmokeCacheDiagnostics = {
		cacheLoads: 0,
		fileReads: new Map(),
		peakHashConcurrency: 0,
	};

	const statuses = await getCacheStatus(projectRoot, steps, diagnostics, {
		cachePath: seededCache,
	});

	assert(
		statuses.length === steps.length,
		'cache status must return one result for every QC step',
	);
	assert(
		statuses.every((status, index) => status.step === steps[index]),
		'bounded-concurrency results must retain the requested step order',
	);
	assert(
		statuses.every(
			(status, index) =>
				status.cached === serial[index]?.skip && status.reason === serial[index]?.reason,
		),
		'optimized status decisions must match independent cache decisions',
	);
	assert(diagnostics.cacheLoads === 1, 'one status invocation must read the cache exactly once');
	assert(diagnostics.fileReads.size > 0, 'the full QC population must exercise file hashing');
	assert(
		[...diagnostics.fileReads.values()].every((count) => count === 1),
		'each normalized dependency file must be read at most once per status invocation',
	);
	assert(
		diagnostics.peakHashConcurrency > 1 && diagnostics.peakHashConcurrency <= 8,
		`file hashing must be concurrent but bounded at eight; saw ${String(diagnostics.peakHashConcurrency)}`,
	);

	// The live project cache is byte-identical before and after everything above.
	assert(
		existsSafeBytes(liveCache).equals(liveBefore),
		'the live project cache must be unchanged by the fixture-seeded regression',
	);

	// A pass recorded in the fixture cache cannot satisfy a check that is missing from
	// another cache: the runner's live cache is in exactly that position on a cold start.
	if (seedStep) {
		const cold = await canSkipStep(projectRoot, seedStep, { cachePath: emptyCache });
		assert(!cold.skip, 'a fixture pass must not satisfy a missing entry in another cache');
	}

	console.log(
		`[OK] ${String(statuses.length)} ordered cache statuses reused one cache read and ` +
			`${String(diagnostics.fileReads.size)} unique file hashes (peak concurrency ` +
			`${String(diagnostics.peakHashConcurrency)}), live cache untouched`,
	);
} finally {
	rmSync(fixtureDir, { force: true, recursive: true });
}

function existsSafeBytes(path: string): Buffer {
	try {
		return readFileSync(path);
	} catch {
		return Buffer.alloc(0);
	}
}
