/**
 * Helpers for test:alert-cooldown: drive the real disk health check and read its alert rows.
 *
 * The disk thresholds are set through updateHealthConfig so the real check reads healthy, degraded
 * or unhealthy on any machine. Time passing is simulated by moving an open row's createdAt or
 * notifiedAt back, never by setting resolvedAt.
 */
// eq comes through the DB surface module: scripts resolve dependencies from the root manifest,
// which does not carry drizzle-orm.
import { eq, getDb } from '../../backend/src/db/index.ts';
import { healthCheckAlerts } from '../../backend/src/db/schema/healthChecks.ts';
import { notifications } from '../../backend/src/db/schema/notifications.ts';
import { runAndStoreSingleCheck } from '../../backend/src/services/health/healthChecks.ts';
import { updateHealthConfig } from '../../backend/src/services/health/healthConfigService.ts';

const MINUTE = 60_000;
type Alert = typeof healthCheckAlerts.$inferSelect;
type DiskStatus = 'degraded' | 'healthy' | 'unhealthy';

let adminId = 0;

/** @param id - The admin recorded as changing the health config */
function setConfigAdmin(id: number): void {
	adminId = id;
}

/** @param threshold - The lowest status that opens or reminds an alert */
function setAlertThreshold(threshold: 'degraded' | 'unhealthy'): void {
	updateHealthConfig({ alertThreshold: threshold }, adminId);
}

/** Make the real disk check read the given status on this machine. */
function setDisk(status: DiskStatus): void {
	const thresholds = {
		degraded: { diskSpaceDegradedThreshold: 0.9999, diskSpaceUnhealthyThreshold: 0.00001 },
		healthy: { diskSpaceDegradedThreshold: 0.00002, diskSpaceUnhealthyThreshold: 0.00001 },
		unhealthy: { diskSpaceDegradedThreshold: 0.9999, diskSpaceUnhealthyThreshold: 0.9998 },
	}[status];
	updateHealthConfig(thresholds, adminId);
}

/** Run the real consumer once and insist the check read `expected`. */
function runDisk(expected: DiskStatus): void {
	const result = runAndStoreSingleCheck('disk');
	if (result?.status !== expected) {
		throw new Error(`disk check read ${result?.status}, not ${expected}`);
	}
}

function diskAlerts(): Alert[] {
	return getDb()
		.select()
		.from(healthCheckAlerts)
		.all()
		.filter((alert) => alert.checkType === 'disk');
}

const openDisk = (): Alert[] => diskAlerts().filter((alert) => alert.resolvedAt === null);
const openStamp = (): number => openDisk()[0]?.notifiedAt?.getTime() ?? 0;
const onlyOpenIs = (severity: 'critical' | 'warn'): boolean =>
	openDisk().length === 1 && openDisk()[0]?.severity === severity;
const notificationCount = (): number => getDb().select().from(notifications).all().length;

/** Dispatch is fire-and-forget; wait for the open row's notifiedAt to move past `after`. */
async function deliveredAfter(after: number): Promise<boolean> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const stamp = openDisk()[0]?.notifiedAt?.getTime();
		if (stamp !== undefined && stamp > after) return true;
		await Bun.sleep(50);
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

function resetDisk(): void {
	setDisk('healthy');
	runDisk('healthy');
}

export {
	ageOpenRow,
	deliveredAfter,
	diskAlerts,
	MINUTE,
	notificationCount,
	onlyOpenIs,
	openDisk,
	openStamp,
	resetDisk,
	runDisk,
	secondStart,
	setAlertThreshold,
	setConfigAdmin,
	setDisk,
};
