#!/usr/bin/env bun
/**
 * Regression coverage for `retention.*Days = 0` meaning "never purge"
 * (`.aidd/features/retention-zero-disables-purge`).
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB: seeds rows far older than any
 * default window into `audit_logs` (the shared `createRetentionCleanupTask` path), `notifications`
 * (its own cutoff guard), and `system_metrics` (per-type cutoff), then proves that
 *  1. with every window set to 0 the cleanup tasks delete nothing and report zero rows cleaned,
 *     while web-vital rows are still purged on their fixed 7-day window — the documented exception;
 *  2. with the windows restored to 30 days the same tasks purge the same rows — so the zero branch
 *     is a real short-circuit, not a task that never deletes anything.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { auditLogs } from '../backend/src/db/schema/auditLogs.ts';
import { notifications } from '../backend/src/db/schema/notifications.ts';
import { systemMetrics } from '../backend/src/db/schema/systemMetrics.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { notificationsCleanupTask } from '../backend/src/services/scheduler/cleanupAuth.ts';
import {
	auditLogCleanupTask,
	systemMetricsCleanupTask,
} from '../backend/src/services/scheduler/cleanupData.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROWS = 3;
const OLD = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function rowCount(table: typeof auditLogs | typeof notifications): number {
	return getDb().select({ id: table.id }).from(table).all().length;
}

function metricCount(metricType: 'system' | 'web-vital-lcp'): number {
	return getDb()
		.select({ metricType: systemMetrics.metricType })
		.from(systemMetrics)
		.all()
		.filter((row) => row.metricType === metricType).length;
}

function seed(): void {
	const db = getDb();
	db.insert(users)
		.values({
			email: 'owner@example.com',
			id: 1,
			passwordHash: 'x',
			role: 'SYSOP',
			username: 'owner',
		})
		.run();
	for (let i = 0; i < SEED_ROWS; i++) {
		db.insert(auditLogs)
			.values({ action: `SEED ${String(i)}`, createdAt: OLD, userId: 1 })
			.run();
		db.insert(notifications)
			.values({
				createdAt: OLD,
				deletedAt: OLD,
				isDeleted: true,
				message: 'old',
				title: `old ${String(i)}`,
				userId: 1,
			})
			.run();
		db.insert(systemMetrics).values({ createdAt: OLD, metricType: 'system', value: 1 }).run();
		db.insert(systemMetrics)
			.values({ createdAt: OLD, metricType: 'web-vital-lcp', value: 1 })
			.run();
	}
}

function setWindows(days: number): void {
	const retention = getConfig().retention;
	retention.auditLogsDays = days;
	retention.notificationsDays = days;
	retention.systemMetricsDays = days;
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-retention-zero-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	seed();

	// --- Phase 1: window 0 keeps every row (web vitals excepted, by design) ---
	setWindows(0);
	const auditZero = auditLogCleanupTask();
	const notifZero = notificationsCleanupTask();
	const metricsZero = systemMetricsCleanupTask();
	assert(
		auditZero.cleaned === 0,
		`auditLogsDays=0 must clean 0 rows, got ${String(auditZero.cleaned)}`,
	);
	assert(
		notifZero.cleaned === 0,
		`notificationsDays=0 must clean 0 rows, got ${String(notifZero.cleaned)}`,
	);
	assert(rowCount(auditLogs) === SEED_ROWS, 'audit_logs rows survive a 0 window');
	assert(rowCount(notifications) === SEED_ROWS, 'notifications rows survive a 0 window');
	assert(metricCount('system') === SEED_ROWS, 'system metric rows survive a 0 window');
	assert(
		metricCount('web-vital-lcp') === 0 && metricsZero.cleaned === SEED_ROWS,
		'web-vital rows are still purged on their fixed 7-day window when systemMetricsDays=0',
	);

	// --- Phase 2: a positive window purges the same rows ---
	setWindows(30);
	const auditOn = auditLogCleanupTask();
	const notifOn = notificationsCleanupTask();
	const metricsOn = systemMetricsCleanupTask();
	assert(
		auditOn.cleaned === SEED_ROWS,
		`auditLogsDays=30 must purge seeded rows, got ${String(auditOn.cleaned)}`,
	);
	assert(
		notifOn.cleaned === SEED_ROWS,
		`notificationsDays=30 must purge seeded rows, got ${String(notifOn.cleaned)}`,
	);
	assert(
		metricsOn.cleaned === SEED_ROWS,
		`systemMetricsDays=30 must purge seeded rows, got ${String(metricsOn.cleaned)}`,
	);
	assert(rowCount(auditLogs) === 0, 'audit_logs rows purged with a positive window');
	assert(rowCount(notifications) === 0, 'notifications rows purged with a positive window');
	assert(metricCount('system') === 0, 'system metric rows purged with a positive window');

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log('[OK] retention-zero: 0 keeps rows forever; positive windows still purge');
		process.exit(0);
	}
	console.error('[FAIL] retention-zero:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-retention-zero:', err);
	process.exit(1);
});
