import { desc, eq, isNull } from 'drizzle-orm';

import { ACTIVE_ALERTS_LIMIT } from '../../constants/health.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';

/**
 * Safely convert a Date to ISO string, returning null for invalid or missing dates.
 *
 * @param date - Date value to convert
 * @returns ISO string or null if the date is missing or invalid
 */
function safeIso(date: Date | null | undefined): null | string {
	if (!date || Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

interface ActiveAlertEntry {
	acknowledgedAt: null | string;
	acknowledgedBy: null | number;
	checkType: string;
	createdAt: string;
	id: number;
	message: string;
	resolvedAt: null | string;
	severity: string;
}

interface AlertRow {
	acknowledgedAt: Date | null;
	acknowledgedBy: null | number;
	checkType: string;
	createdAt: Date;
	id: number;
	message: string;
	resolvedAt: Date | null;
	severity: string;
}

/**
 * Map a raw health_check_alerts row to a serialisable ActiveAlertEntry.
 *
 * @param row - Raw database row
 * @returns Serialisable alert entry
 */
function mapRowToAlertEntry(row: AlertRow): ActiveAlertEntry {
	return {
		acknowledgedAt: safeIso(row.acknowledgedAt),
		acknowledgedBy: row.acknowledgedBy ?? null,
		checkType: row.checkType,
		createdAt: safeIso(row.createdAt) ?? new Date(0).toISOString(),
		id: row.id,
		message: row.message,
		resolvedAt: safeIso(row.resolvedAt),
		severity: row.severity,
	};
}

/**
 * Get active (unresolved) alerts.
 *
 * @returns Array of unresolved alerts
 */
export function getActiveAlerts(): ActiveAlertEntry[] {
	const db = getDb();

	const rows = db
		.select()
		.from(healthCheckAlerts)
		.where(isNull(healthCheckAlerts.resolvedAt))
		.orderBy(desc(healthCheckAlerts.createdAt))
		.limit(ACTIVE_ALERTS_LIMIT)
		.all();

	return rows.map(mapRowToAlertEntry);
}

/**
 * Acknowledge an alert (mark as seen by admin).
 *
 * @param alertId - ID of alert to acknowledge
 * @param userId - ID of user acknowledging the alert
 * @returns Updated alert or null if not found
 */
export function acknowledgeAlert(alertId: number, userId: number): ActiveAlertEntry | null {
	const db = getDb();

	const row = db
		.update(healthCheckAlerts)
		.set({
			acknowledgedAt: new Date(),
			acknowledgedBy: userId,
		})
		.where(eq(healthCheckAlerts.id, alertId))
		.returning()
		.get();

	if (!row) {
		return null;
	}

	return mapRowToAlertEntry(row);
}

/**
 * Resolve an alert (mark as fixed/resolved).
 *
 * @param alertId - ID of alert to resolve
 * @returns Updated alert or null if not found
 */
export function resolveAlert(alertId: number): ActiveAlertEntry | null {
	const db = getDb();

	const row = db
		.update(healthCheckAlerts)
		.set({
			resolvedAt: new Date(),
		})
		.where(eq(healthCheckAlerts.id, alertId))
		.returning()
		.get();

	if (!row) {
		return null;
	}

	return mapRowToAlertEntry(row);
}
