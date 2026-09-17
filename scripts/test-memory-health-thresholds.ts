#!/usr/bin/env bun
/**
 * Regression coverage for the memory health check actually being able to report a problem.
 *
 * The defect this gate was written for: the check compared heapUsed against heapTotal, and Bun
 * reports heapTotal as the currently committed heap rather than a ceiling, so heapUsed regularly
 * exceeds it. The runner treated that as an unusable ratio, pinned the reported percentage to 0,
 * and returned healthy every time. The two thresholds in Settings, System Health could therefore
 * never be crossed on the runtime the template actually runs on: memory exhaustion would never
 * surface through the health endpoint, and an operator could spend an afternoon tuning two
 * settings that had no effect.
 *
 * The property under test is that the thresholds govern the answer. The check is driven three
 * times against the same live process with the thresholds moved around the memory it is really
 * using, and the status has to follow them: healthy below both, degraded between them, unhealthy
 * above both. A check that ignores its thresholds cannot pass all three.
 *
 * Runs fully in-process against a throwaway temp-file SQLite database, because the thresholds live
 * in the settings table and the runner reads them from there.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, initializeDatabase } from '../backend/src/db/index.ts';
import { checkMemory } from '../backend/src/services/health/healthCheckRunners.ts';
import { update } from '../backend/src/services/settingsService.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The settings row the health runner reads its thresholds out of. */
const HEALTH_CONFIG_KEY = 'health_check_config';

const failures: string[] = [];

/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * Put the two memory thresholds in place, writing the settings row the runner reads.
 *
 * Writes the row directly rather than going through updateHealthConfig so the gate does not need a
 * user to attribute the change to.
 *
 * @param degraded - Ratio above which memory is degraded.
 * @param unhealthy - Ratio above which memory is unhealthy.
 */
function setThresholds(degraded: number, unhealthy: number): void {
	update({
		key: HEALTH_CONFIG_KEY,
		updatedBy: null,
		value: JSON.stringify({
			memoryHeapDegradedThreshold: degraded,
			memoryHeapUnhealthyThreshold: unhealthy,
		}),
	});
}

/**
 * Read a numeric field out of the check's details, or NaN when it is absent.
 *
 * @param details - The details the check reported.
 * @param key - The field to read.
 * @returns The number the field holds, or NaN.
 */
function detail(details: Record<string, unknown> | undefined, key: string): number {
	const value = details?.[key];
	return typeof value === 'number' ? value : Number.NaN;
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-memory-health-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);

	// Start well above anything the process could be using so the first reading is the healthy one.
	setThresholds(0.98, 0.99);
	const baseline = checkMemory();

	const usedBytes = detail(baseline.details, 'memoryUsedBytes');
	const limitBytes = detail(baseline.details, 'memoryLimitBytes');

	assert(
		usedBytes > 0,
		'the check reports the memory it measured as memoryUsedBytes, so an operator can see what the percentage was taken from',
	);
	assert(
		limitBytes > 0,
		'the check reports the ceiling it measured against as memoryLimitBytes rather than an implicit one',
	);
	assert(
		typeof baseline.details?.memoryLimitSource === 'string',
		'the check names where the ceiling came from, so a container limit is not mistaken for the host total',
	);
	assert(
		baseline.status === 'healthy',
		`memory is healthy when it sits below both thresholds, got ${baseline.status}`,
	);

	// Fall back to the same reading the fixed check takes, so the crossings below are still
	// meaningful when the fields above are missing and this gate is running against the defect.
	const ratio =
		usedBytes > 0 && limitBytes > 0
			? usedBytes / limitBytes
			: process.memoryUsage().rss / totalmem();

	assert(
		ratio > 0 && ratio < 1,
		`the process uses some but not all of the memory available to it, got a ratio of ${String(ratio)}`,
	);

	const reported = detail(baseline.details, 'memoryPercentage');
	assert(
		Math.abs(reported - ratio * 100) < 0.2,
		`the reported percentage matches the bytes it was taken from, got ${String(reported)} for a ratio of ${String(ratio)}`,
	);

	setThresholds(ratio / 2, 1);
	const degraded = checkMemory();
	assert(
		degraded.status === 'degraded',
		`memory is degraded once usage passes the degraded threshold, got ${degraded.status}`,
	);

	setThresholds(ratio / 4, ratio / 2);
	const unhealthy = checkMemory();
	assert(
		unhealthy.status === 'unhealthy',
		`memory is unhealthy once usage passes the unhealthy threshold, got ${unhealthy.status}`,
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length > 0) {
		for (const failure of failures) console.error(`- ${failure}`);
		console.log(
			`[FAIL] memory-health-thresholds: ${String(failures.length)} of the memory check rules do not hold`,
		);
		process.exit(1);
	}

	console.log(
		'[OK] memory-health-thresholds: 3 threshold placements over the live process each produce the status they describe',
	);
	process.exit(0);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-memory-health-thresholds:', err);
	process.exit(1);
});
