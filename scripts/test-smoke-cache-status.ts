#!/usr/bin/env bun
/** Regression coverage for invocation-scoped cache-status reuse and ordered results. */
import { join } from 'node:path';

import { canSkipStep, getCacheStatus, type SmokeCacheDiagnostics } from './smoke-cache.ts';

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

const serial: Awaited<ReturnType<typeof canSkipStep>>[] = [];
for (const step of steps) serial.push(await canSkipStep(projectRoot, step));

const diagnostics: SmokeCacheDiagnostics = {
	cacheLoads: 0,
	fileReads: new Map(),
	peakHashConcurrency: 0,
};
const statuses = await getCacheStatus(projectRoot, steps, diagnostics);

assert(statuses.length === steps.length, 'cache status must return one result for every QC step');
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

console.log(
	`[OK] ${String(statuses.length)} ordered cache statuses reused one cache read and ` +
		`${String(diagnostics.fileReads.size)} unique file hashes (peak concurrency ` +
		`${String(diagnostics.peakHashConcurrency)})`,
);
