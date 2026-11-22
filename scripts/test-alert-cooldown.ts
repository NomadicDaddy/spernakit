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
 * migrated SQLite database with real seeded admins (the in-app channel's recipients), through the
 * helpers in lib/alert-test-disk.ts. Cooldown is 60 minutes.
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
import { cleanupStaleAlerts } from '../backend/src/services/health/healthHistoryService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import {
	ageOpenRow,
	deliveredAfter,
	diskAlerts,
	MINUTE,
	notificationCount,
	onlyOpenIs,
	openDisk,
	resetDisk,
	runDisk,
	secondStart,
	setAlertThreshold,
	setConfigAdmin,
	setDisk,
} from './lib/alert-test-disk.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = resolve(import.meta.dir, '..');
const COOLDOWN = 60;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** In-app notifications one send delivers (one per admin), measured by the first send. */
let perSend = 0;

/** In-app notifications delivered by `run`, once its sends have settled and notifiedAt is set. */
async function sendsBy(run: () => void): Promise<number> {
	const before = notificationCount();
	run();
	await deliveredAfter(0);
	await Bun.sleep(300);
	return (notificationCount() - before) / perSend;
}

async function longDegraded(): Promise<void> {
	setDisk('degraded');
	const before = notificationCount();
	runDisk('degraded');
	assert(await deliveredAfter(0), 'A: the first warning is sent at once');
	perSend = notificationCount() - before;
	assert(perSend > 0, 'A: the first warning reaches the admins in-app');
	// Each run is a check 20 minutes after the open row was created, past the old 15-minute dedup.
	const inside = await sendsBy(() => {
		for (let run = 0; run < 6; run++) {
			ageOpenRow(20, 'createdAt');
			runDisk('degraded');
		}
	});
	assert(openDisk().length === 1, 'A: a long degraded spell keeps exactly one open alert');
	assert(inside === 0, 'A: no reminder inside the cooldown');
	ageOpenRow(COOLDOWN + 1);
	assert(
		(await sendsBy(() => runDisk('degraded'))) === 1,
		'A: one reminder once the cooldown passes',
	);
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

async function escalate(): Promise<void> {
	resetDisk();
	setDisk('degraded');
	runDisk('degraded');
	await deliveredAfter(0);
	setDisk('unhealthy');
	assert(
		(await sendsBy(() => runDisk('unhealthy'))) === 1,
		'C: escalation sends a critical at once',
	);
	assert(onlyOpenIs('critical'), 'C: one open critical row');
	const lasting = await sendsBy(() => {
		for (let run = 0; run < 4; run++) runDisk('unhealthy');
	});
	assert(lasting === 0, 'D: a lasting critical is not re-sent each run');
	ageOpenRow(COOLDOWN + 1);
	assert(
		(await sendsBy(() => runDisk('unhealthy'))) === 1,
		'D: a lasting critical reminds once the cooldown passes',
	);
}

async function escalateAndFallBack(): Promise<void> {
	await escalate();
	setDisk('degraded');
	const fellBack = await sendsBy(() => runDisk('degraded'));
	assert(onlyOpenIs('critical'), 'C: falling back keeps the critical row');
	assert(fellBack === 0, 'C: falling back sends no immediate notice');
	ageOpenRow(COOLDOWN + 1);
	assert(
		(await sendsBy(() => runDisk('degraded'))) === 1,
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

async function pendingSendAndThreshold(): Promise<void> {
	resetDisk();
	setDisk('degraded');
	const pending = await sendsBy(() => {
		runDisk('degraded');
		runDisk('degraded');
	});
	assert(pending === 1, 'H: a run while the first send is pending does not send again');

	resetDisk();
	setAlertThreshold('unhealthy');
	setDisk('degraded');
	runDisk('degraded');
	assert(openDisk().length === 0, 'I: a result below alertThreshold opens nothing');
	setAlertThreshold('degraded');
	runDisk('degraded');
	await deliveredAfter(0);
	setAlertThreshold('unhealthy');
	ageOpenRow(COOLDOWN + 1);
	assert(
		(await sendsBy(() => runDisk('degraded'))) === 0,
		'I: a result below alertThreshold sends no reminder',
	);
	setAlertThreshold('degraded');
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
	setConfigAdmin(getDb().select({ id: users.id }).from(users).limit(1).get()?.id ?? 0);
	await longDegraded();
	await recoverAndRecur();
	await escalateAndFallBack();
	await overridesAndDuplicates();
	await undeliveredRetries();
	await pendingSendAndThreshold();
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
