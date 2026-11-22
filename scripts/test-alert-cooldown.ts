#!/usr/bin/env bun
/**
 * Gate: a health check keeps one open alert per condition, reminds from it once per cooldown, and
 * resolves it when the check recovers (`.aidd/features/health-alert-resolve-on-recovery`).
 *
 * The defects: a check that stayed degraded added a new unresolved row every 20 minutes (the
 * creation dedup looked back only 15 minutes, and checks run every 5), and a check that recovered
 * never resolved its alerts.
 *
 * Every case drives the real consumer, runAndStoreSingleCheck('disk'), against a throwaway
 * migrated SQLite database with real seeded admins (the in-app channel's recipients). The disk
 * thresholds are set through updateHealthConfig so the real check reads healthy, degraded or
 * unhealthy. Time passing is simulated by moving an open row's notifiedAt back, never by setting
 * resolvedAt. Cooldown is 60 minutes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
// eq comes through the DB surface module: this script resolves dependencies from the root
// manifest, which does not carry drizzle-orm.
import { closeDatabase, eq, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { healthCheckAlerts } from '../backend/src/db/schema/healthChecks.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import {
	getActiveAlerts,
	resolveAlert,
} from '../backend/src/services/health/healthAlertService.ts';
import { runAndStoreSingleCheck } from '../backend/src/services/health/healthChecks.ts';
import { updateHealthConfig } from '../backend/src/services/health/healthConfigService.ts';
import { cleanupStaleAlerts } from '../backend/src/services/health/healthHistoryService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = resolve(import.meta.dir, '..');
const COOLDOWN = 60;
const MINUTE = 60_000;
type Alert = typeof healthCheckAlerts.$inferSelect;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

let adminId = 0;
/** Make the real disk check read the given status on this machine. */
function setDisk(status: 'degraded' | 'healthy' | 'unhealthy'): void {
	const thresholds = {
		degraded: { diskSpaceDegradedThreshold: 0.9999, diskSpaceUnhealthyThreshold: 0.00001 },
		healthy: { diskSpaceDegradedThreshold: 0.00002, diskSpaceUnhealthyThreshold: 0.00001 },
		unhealthy: { diskSpaceDegradedThreshold: 0.9999, diskSpaceUnhealthyThreshold: 0.9998 },
	}[status];
	updateHealthConfig(thresholds, adminId);
}

function runDisk(expected: string): void {
	const result = runAndStoreSingleCheck('disk');
	if (result?.status !== expected)
		throw new Error(`disk check read ${result?.status}, not ${expected}`);
}

function diskAlerts(): Alert[] {
	return getDb()
		.select()
		.from(healthCheckAlerts)
		.all()
		.filter((alert) => alert.checkType === 'disk');
}
const openDisk = (): Alert[] => diskAlerts().filter((alert) => alert.resolvedAt === null);

/** Dispatch is fire-and-forget; wait for the open row's notifiedAt to move past `after`. */
async function deliveredAfter(after: number): Promise<boolean> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const stamp = openDisk()[0]?.notifiedAt?.getTime();
		if (stamp !== undefined && stamp > after) return true;
		await new Promise((settled) => setTimeout(settled, 50));
	}
	return false;
}

/** notifiedAt is stored in whole seconds, so compare a fresh send against the second it began. */
function secondStart(): number {
	return Math.floor(Date.now() / 1000) * 1000 - 1;
}

/** Move the open row's notifiedAt or createdAt back by `minutes`, to stand in for time passing. */
function ageOpenRow(minutes: number, field: 'createdAt' | 'notifiedAt' = 'notifiedAt'): void {
	const [open] = openDisk();
	if (!open) throw new Error('no open disk alert to age');
	getDb()
		.update(healthCheckAlerts)
		.set({ [field]: new Date(Date.now() - minutes * MINUTE) })
		.where(eq(healthCheckAlerts.id, open.id))
		.run();
}

const openStamp = (): number => openDisk()[0]?.notifiedAt?.getTime() ?? 0;
const onlyOpenIs = (severity: 'critical' | 'warn'): boolean =>
	openDisk().length === 1 && openDisk()[0]?.severity === severity;

function resetDisk(): void {
	setDisk('healthy');
	runDisk('healthy');
}

async function longDegraded(): Promise<void> {
	setDisk('degraded');
	runDisk('degraded');
	assert(await deliveredAfter(0), 'A: the first warning is sent at once');
	const first = openStamp();
	// Each run is a check 20 minutes after the open row was created, past the old 15-minute dedup.
	for (let run = 0; run < 6; run++) {
		ageOpenRow(20, 'createdAt');
		runDisk('degraded');
	}
	await Bun.sleep(300);
	assert(openDisk().length === 1, 'A: a long degraded spell keeps exactly one open alert');
	assert(openStamp() === first, 'A: no reminder inside the cooldown');
	ageOpenRow(COOLDOWN + 1);
	const aged = Date.now() - (COOLDOWN + 1) * MINUTE;
	runDisk('degraded');
	assert(await deliveredAfter(aged + MINUTE), 'A: a reminder goes out once the cooldown passes');
	assert(openDisk().length === 1, 'A: the reminder comes from the same row');
}

async function recoverAndRecur(): Promise<void> {
	resetDisk();
	assert(openDisk().length === 0, 'B: a healthy check resolves its open alert');
	assert(
		!getActiveAlerts().some((alert) => alert.checkType === 'disk'),
		'B: the resolved alert is gone from Active Alerts',
	);
	assert(
		diskAlerts().every((alert) => alert.resolvedAt instanceof Date),
		'B: resolvedAt is stored',
	);
	const before = secondStart();
	setDisk('degraded');
	runDisk('degraded');
	assert(await deliveredAfter(before), 'B: a recurrence opens and sends a new alert at once');
}

async function escalate(): Promise<number> {
	resetDisk();
	setDisk('degraded');
	runDisk('degraded');
	await deliveredAfter(0);
	setDisk('unhealthy');
	runDisk('unhealthy');
	assert(await deliveredAfter(0), 'C: escalation sends a critical at once');
	assert(onlyOpenIs('critical'), 'C: one open critical row');
	const critical = openStamp();
	for (let run = 0; run < 4; run++) runDisk('unhealthy');
	await Bun.sleep(300);
	assert(openStamp() === critical, 'D: a lasting critical is not re-sent each run');
	return critical;
}

async function escalateAndFallBack(): Promise<void> {
	const critical = await escalate();
	setDisk('degraded');
	runDisk('degraded');
	await Bun.sleep(300);
	assert(onlyOpenIs('critical'), 'C: falling back keeps the critical row');
	assert(openStamp() === critical, 'C: falling back sends no immediate notice');
	ageOpenRow(COOLDOWN + 1);
	const aged = Date.now() - (COOLDOWN + 1) * MINUTE;
	runDisk('degraded');
	assert(
		await deliveredAfter(aged + MINUTE),
		'C: the fallen-back row reminds once the cooldown passes',
	);
	assert(openDisk()[0]?.severity === 'critical', 'C: that reminder is at critical');
}

async function overridesAndDuplicates(): Promise<void> {
	resetDisk();
	setDisk('degraded');
	runDisk('degraded');
	await deliveredAfter(0);
	const [open] = openDisk();
	if (open) resolveAlert(open.id);
	const afterResolve = secondStart();
	runDisk('degraded');
	assert(
		await deliveredAfter(afterResolve),
		'E: after a manual resolve the next run opens and sends',
	);

	const [current] = openDisk();
	if (current) {
		getDb()
			.update(healthCheckAlerts)
			.set({ createdAt: new Date(Date.now() - 400 * 24 * 60 * MINUTE) })
			.where(eq(healthCheckAlerts.id, current.id))
			.run();
	}
	cleanupStaleAlerts();
	assert(openDisk().length === 0, 'E: the admin bulk cleanup resolves the open row by age');
	const afterCleanup = secondStart();
	runDisk('degraded');
	assert(
		await deliveredAfter(afterCleanup),
		'E: after the bulk cleanup the next run opens and sends',
	);

	for (let copy = 0; copy < 3; copy++) {
		getDb()
			.insert(healthCheckAlerts)
			.values({
				checkType: 'disk',
				message: 'disk duplicate from before the fix',
				severity: 'warn',
			})
			.run();
	}
	getDb()
		.insert(healthCheckAlerts)
		.values({ checkType: 'memory', message: 'memory', severity: 'warn' })
		.run();
	runDisk('degraded');
	assert(openDisk().length === 1, 'F: existing duplicates collapse to one open row');
	resetDisk();
	const memoryOpen = getDb()
		.select()
		.from(healthCheckAlerts)
		.all()
		.filter((alert) => alert.checkType === 'memory' && alert.resolvedAt === null);
	assert(memoryOpen.length === 1, 'F: a healthy disk check leaves another check type alone');
}

async function undeliveredRetries(): Promise<void> {
	resetDisk();
	getConfig().alerting.inApp.enabled = false;
	setDisk('degraded');
	runDisk('degraded');
	await Bun.sleep(300);
	assert(
		openDisk()[0]?.notifiedAt === null,
		'G: a send no channel delivered leaves notifiedAt null',
	);
	getConfig().alerting.inApp.enabled = true;
	runDisk('degraded');
	assert(await deliveredAfter(0), 'G: the next run retries the undelivered alert');
	assert(openDisk().length === 1, 'G: the retry uses the same row');
}

initializeConfig();
const config = getConfig();
applyEphemeralAuthKeys(config.security);
config.alerting.cooldownMinutes = COOLDOWN;
config.alerting.inApp.enabled = true;
config.alerting.email.enabled = false;
config.alerting.webhook.enabled = false;

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-alert-cooldown-'));
try {
	const dbPath = join(tmpDir, 'test.db');
	// The disk check measures the database's folder, so point it at this throwaway one.
	config.database.url = dbPath;
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), 4);
	adminId = getDb().select({ id: users.id }).from(users).limit(1).get()?.id ?? 0;
	await longDegraded();
	await recoverAndRecur();
	await escalateAndFallBack();
	await overridesAndDuplicates();
	await undeliveredRetries();
} finally {
	await closeDatabase();
	// Statements cached on the closed handle keep the file open on Windows until collected.
	Bun.gc(true);
	try {
		rmSync(tmpDir, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
	} catch {
		console.warn(`alert cooldown: could not remove ${tmpDir}; remove it by hand`);
	}
}

if (failures.length > 0) {
	console.error(`alert cooldown: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('alert cooldown: all checks passed');
