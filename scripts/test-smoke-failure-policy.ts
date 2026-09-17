#!/usr/bin/env bun
/** Proves fast QC stops at its first failing fixture step while full QC aggregates failures. */
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { shouldAggregateFailures } from './lib/smoke/failure-policy.ts';

interface FixtureStep {
	name: string;
	run: () => number;
}

function runFixture(fast: boolean, marker: string): { failed: string[]; ran: string[] } {
	const ran: string[] = [];
	const failed: string[] = [];
	const steps: FixtureStep[] = [
		{ name: 'first failure', run: () => 1 },
		{
			name: 'later failure',
			run: () => {
				appendFileSync(marker, 'ran\n');
				return 2;
			},
		},
	];
	const aggregate = shouldAggregateFailures('qc', fast);
	for (const step of steps) {
		ran.push(step.name);
		if (step.run() === 0) continue;
		failed.push(step.name);
		if (!aggregate) break;
	}
	return { failed, ran };
}

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

const tempDir = mkdtempSync(join(tmpdir(), 'spernakit-smoke-policy-'));
try {
	const fastMarker = join(tempDir, 'fast-later-step');
	const fast = runFixture(true, fastMarker);
	assert(fast.ran.length === 1, 'fast QC must stop after the first failing fixture step');
	assert(fast.failed.length === 1, 'fast QC must report only the failure it reached');
	assert(!existsSync(fastMarker), 'fast QC must not run a later fixture step');

	const fullMarker = join(tempDir, 'full-later-step');
	const full = runFixture(false, fullMarker);
	assert(full.ran.length === 2, 'full QC must run every independent fixture step');
	assert(full.failed.length === 2, 'full QC must report every failing fixture step');
	assert(existsSync(fullMarker), 'full QC must reach a later fixture step after a failure');

	assert(!shouldAggregateFailures('dev', false), 'lifecycle modes must remain fail-fast');
	console.log('[OK] fast QC fails fast; full QC aggregates independent failures');
} finally {
	rmSync(tempDir, { force: true, recursive: true });
}
