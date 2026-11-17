#!/usr/bin/env bun
/**
 * Gate: the warning cooldown is measured from the last successful notification, not from the
 * newest alert row (`.aidd/features/audit-logic-1790885878-alert-cooldown-is-measured-from-the-
 * newest-alert-row-so-any-cooldown-above-15-mi`).
 *
 * The defect: a new alert row is created every 15 minutes while a check stays degraded, and the
 * cooldown asked whether any unresolved alert of that type was created within cooldownMinutes.
 * Each suppressed row was itself recent, so with a cooldown above 15 minutes the first warning
 * was the only one ever sent.
 *
 * Against a throwaway migrated SQLite database with real seeded admins (the in-app channel's
 * recipients), cooldown 60 minutes:
 *  1. The defect: a warning delivered 70 minutes ago plus a newer, never-delivered row created
 *     10 minutes ago does not suppress the next warning.
 *  2. Same-or-lower within the window: a warning delivered 10 minutes ago suppresses the next.
 *  3. Independent checks: a delivery for one check type does not suppress another.
 *  4. Resolved then recurring: a resolved alert's delivery does not suppress a new one.
 *  5. Escalation: a critical alert is delivered even inside the window.
 *  6. A real createAlertAndNotify run stamps notifiedAt once a channel delivers, and leaves it
 *     null when every channel is off, so an undelivered row never starts a window.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { healthCheckAlerts } from '../backend/src/db/schema/healthChecks.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import { createAlertAndNotify } from '../backend/src/services/health/healthAlertCreationService.ts';
import { hasRecentAlert } from '../backend/src/services/notification/alertCooldown.ts';
import { sendAlertNotifications } from '../backend/src/services/notification/alertNotificationService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = resolve(import.meta.dir, '..');
const COOLDOWN = 60;
const MINUTE = 60_000;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * MINUTE);
}

/** Insert an alert row as the health checks would have, with chosen timestamps. */
function insertAlert(input: {
	checkType: string;
	createdAt: Date;
	notifiedAt?: Date;
	resolvedAt?: Date;
	severity?: 'critical' | 'warn';
}): number {
	const row = getDb()
		.insert(healthCheckAlerts)
		.values({
			checkType: input.checkType,
			createdAt: input.createdAt,
			message: `${input.checkType} fixture`,
			notifiedAt: input.notifiedAt ?? null,
			resolvedAt: input.resolvedAt ?? null,
			severity: input.severity ?? 'warn',
		})
		.returning({ id: healthCheckAlerts.id })
		.get();
	if (!row) throw new Error('alert insert returned no row');
	return row.id;
}

function cooldownCases(): void {
	// 1. The defect scenario.
	insertAlert({ checkType: 'disk', createdAt: minutesAgo(70), notifiedAt: minutesAgo(70) });
	insertAlert({ checkType: 'disk', createdAt: minutesAgo(10) });
	const candidate = insertAlert({ checkType: 'disk', createdAt: new Date() });
	assert(
		!hasRecentAlert('disk', COOLDOWN, candidate),
		'1: a delivery 70 minutes ago must not suppress a warning when the cooldown is 60',
	);

	// 2. Same or lower inside the window.
	insertAlert({ checkType: 'memory', createdAt: minutesAgo(10), notifiedAt: minutesAgo(10) });
	const inside = insertAlert({ checkType: 'memory', createdAt: new Date() });
	assert(
		hasRecentAlert('memory', COOLDOWN, inside),
		'2: a delivery 10 minutes ago must suppress the next warning',
	);

	// 3. Independent check types.
	const other = insertAlert({ checkType: 'database', createdAt: new Date() });
	assert(
		!hasRecentAlert('database', COOLDOWN, other),
		'3: a memory delivery must not suppress a database warning',
	);

	// 4. Resolved, then recurring.
	insertAlert({
		checkType: 'filesystem',
		createdAt: minutesAgo(5),
		notifiedAt: minutesAgo(5),
		resolvedAt: minutesAgo(2),
	});
	const recur = insertAlert({ checkType: 'filesystem', createdAt: new Date() });
	assert(
		!hasRecentAlert('filesystem', COOLDOWN, recur),
		'4: a resolved alert must not suppress the recurrence',
	);
}

async function escalationCase(): Promise<void> {
	const id = insertAlert({ checkType: 'memory', createdAt: new Date(), severity: 'critical' });
	const results = await sendAlertNotifications({
		checkType: 'memory',
		createdAt: new Date(),
		id,
		message: 'memory fixture',
		severity: 'critical',
	});
	assert(
		results.some((r) => r.success),
		'5: a critical alert must be delivered inside the warning window',
	);
}

async function notifiedAtFor(checkType: string): Promise<Date | null | undefined> {
	// createAlertAndNotify dispatches fire-and-forget; give the in-app write time to land.
	for (let attempt = 0; attempt < 40; attempt++) {
		const row = getDb()
			.select()
			.from(healthCheckAlerts)
			.all()
			.find((alert) => alert.checkType === checkType);
		if (row?.notifiedAt) return row.notifiedAt;
		await new Promise((settled) => setTimeout(settled, 50));
	}
	return null;
}

async function dispatchCases(): Promise<void> {
	createAlertAndNotify({ checkType: 'delivered-check', status: 'degraded' });
	assert(
		(await notifiedAtFor('delivered-check')) instanceof Date,
		'6: a delivered alert must record notifiedAt',
	);

	getConfig().alerting.inApp.enabled = false;
	createAlertAndNotify({ checkType: 'undelivered-check', status: 'degraded' });
	assert(
		(await notifiedAtFor('undelivered-check')) === null,
		'6: an alert no channel delivered must leave notifiedAt null',
	);
	getConfig().alerting.inApp.enabled = true;
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
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), 4);
	cooldownCases();
	await escalationCase();
	await dispatchCases();
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
