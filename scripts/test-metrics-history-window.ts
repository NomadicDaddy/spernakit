#!/usr/bin/env bun
/**
 * Regression coverage for the dashboard's Historical Trends range selector meaning something.
 *
 * The defect this gate was written for: the 6h, 12h and 24h options all drew the same hour and a
 * half of history. `getMetricsHistory` asked for the newest `limit` rows inside the window, and the
 * cap is 100 while the collector writes one sample a minute, so every window longer than 100
 * minutes was answered with the same 100 most recent minutes. The chart's x-axis did not grow when
 * the range did, and an operator reading a 24h chart was looking at about 90 minutes.
 *
 * The property under test is that the answer spans the window that was asked for. The rows are
 * thinned across the whole window rather than truncated to its newest end, so a longer range shows
 * a longer span at the same cost in points, and a range short enough to fit under the cap is
 * returned whole as it always was.
 *
 * Runs fully in-process against a throwaway temp-file SQLite database seeded with one sample a
 * minute for 24 hours, the shape the collector actually produces. `cpuUsage` carries each sample's
 * age in minutes so a returned row can be traced back to the row it came from, which is what lets
 * the thinning be checked as thinning: every point is a sample that was really recorded, not an
 * average of several.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { systemMetrics } from '../backend/src/db/schema/systemMetrics.ts';
import { getMetricsHistory } from '../backend/src/services/metrics/metricsQueryService.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** One full day of one-minute samples, which is what the longest range on the dashboard asks for. */
const SEEDED_MINUTES = 24 * MINUTES_PER_HOUR;

/** The cap the route applies, and the only limit the dashboard ever sends. */
const LIMIT = 100;

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
 * Write one sample a minute for a day, newest first, each tagged with its own age.
 *
 * @param now - The instant the newest sample is written at.
 */
function seed(now: number): void {
	const db = getDb();
	db.insert(systemMetrics)
		.values(
			Array.from({ length: SEEDED_MINUTES + 1 }, (_unused, minutesAgo) => ({
				cpuUsage: minutesAgo,
				createdAt: new Date(now - minutesAgo * MS_PER_MINUTE),
				memoryUsage: 50,
				metricType: 'system' as const,
			})),
		)
		.run();
}

/**
 * The span a range covers, in minutes, from the ages carried by the rows it returned.
 *
 * @param hours - The range to ask for.
 * @returns The span, the number of points, and the ages themselves.
 */
function range(hours: number): { ages: number[]; count: number; spanMinutes: number } {
	const ages = getMetricsHistory(hours, LIMIT).map((entry) => entry.cpuUsage ?? -1);
	const oldest = Math.max(...ages);
	const newest = Math.min(...ages);
	return { ages, count: ages.length, spanMinutes: oldest - newest };
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-metrics-window-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	seed(Date.now());

	const day = range(24);
	const sixHours = range(6);
	const hour = range(1);

	// The defect itself: a longer range has to show a longer span.
	assert(
		day.spanMinutes >= 23 * MINUTES_PER_HOUR,
		`a 24h range spans at least 23 hours of samples, got ${String(day.spanMinutes)} minutes`,
	);
	assert(
		sixHours.spanMinutes >= 5 * MINUTES_PER_HOUR,
		`a 6h range spans at least 5 hours of samples, got ${String(sixHours.spanMinutes)} minutes`,
	);
	assert(
		day.spanMinutes > sixHours.spanMinutes * 3,
		'the 24h range covers visibly more time than the 6h range rather than the same newest window',
	);

	// A range that fits under the cap is still returned whole, at full resolution.
	assert(
		hour.count >= MINUTES_PER_HOUR,
		`a 1h range returns every one of its samples, got ${String(hour.count)}`,
	);
	assert(
		hour.ages.every((age, index) => age === index),
		'a 1h range returns consecutive minutes, so nothing is thinned that did not need to be',
	);

	// The cap still holds, and the rows are real samples in the order the chart reads them.
	for (const [label, result] of [
		['24h', day],
		['6h', sixHours],
		['1h', hour],
	] as const) {
		assert(
			result.count > 0 && result.count <= LIMIT,
			`a ${label} range returns between 1 and ${String(LIMIT)} points, got ${String(result.count)}`,
		);
		assert(
			result.ages.every((age) => Number.isInteger(age) && age >= 0),
			`every ${label} point is a sample that was really recorded rather than a blend of several`,
		);
		assert(
			result.ages.every((age, index) => index === 0 || age > (result.ages[index - 1] ?? -1)),
			`a ${label} range is ordered newest first, which is what the chart reads`,
		);
	}

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length > 0) {
		for (const failure of failures) console.error(`- ${failure}`);
		console.log(
			`[FAIL] metrics-history-window: ${String(failures.length)} of the range rules do not hold`,
		);
		process.exit(1);
	}

	console.log(
		`[OK] metrics-history-window: 3 ranges over ${String(SEEDED_MINUTES)} seeded samples each span the window they name`,
	);
	process.exit(0);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-metrics-history-window:', err);
	process.exit(1);
});
