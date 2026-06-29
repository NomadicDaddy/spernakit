import { and, desc, eq, gte, isNull } from 'drizzle-orm';

import { ACTIVE_ALERTS_LIMIT } from '../../constants/health.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';
import { logger } from '../../utils/logger.ts';
import { sendAlertWithRetry } from '../notificationService.ts';
import { getHealthConfig } from './healthConfigService.ts';

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

/** Deduplication window: skip new alerts if an unresolved alert for the same checkType exists within this period */
const ALERT_DEDUP_MINUTES = 15;

/**
 * Check if an unresolved alert already exists for this check type within the dedup window.
 *
 * @param checkType - The health check type
 * @returns True if a recent unresolved alert exists
 */
function hasRecentUnresolvedAlert(checkType: string): boolean {
	const db = getDb();
	const cutoff = new Date(Date.now() - ALERT_DEDUP_MINUTES * 60 * 1000);

	const existing = db
		.select({ id: healthCheckAlerts.id })
		.from(healthCheckAlerts)
		.where(
			and(
				eq(healthCheckAlerts.checkType, checkType),
				isNull(healthCheckAlerts.resolvedAt),
				gte(healthCheckAlerts.createdAt, cutoff)
			)
		)
		.orderBy(desc(healthCheckAlerts.createdAt))
		.limit(1)
		.get();

	return existing !== undefined;
}

/**
 * Create an alert row and send notifications for a non-healthy check.
 * Deduplicates: skips if an unresolved alert for the same check type exists within the dedup window.
 *
 * @param check - The health check result
 * @param check.checkType - The type of health check
 * @param check.details - Optional details about the check result
 * @param check.status - The health check status
 */
interface HealthCheckInput {
	checkType: string;
	details?: Record<string, unknown>;
	status: string;
}

const SEVERITY_ORDER = { degraded: 1, unhealthy: 2 } as const;

function shouldCreateAlert(check: HealthCheckInput): boolean {
	const healthConfig = getHealthConfig();

	if (!healthConfig.alertsEnabled) {
		logger.debug({ checkType: check.checkType }, 'Skipping alert: alerts are disabled');
		return false;
	}

	const checkSeverity = SEVERITY_ORDER[check.status as keyof typeof SEVERITY_ORDER] ?? 0;
	const thresholdSeverity = SEVERITY_ORDER[healthConfig.alertThreshold] ?? 1;
	if (checkSeverity < thresholdSeverity) {
		logger.debug(
			{
				alertThreshold: healthConfig.alertThreshold,
				checkType: check.checkType,
				status: check.status,
			},
			'Skipping alert: severity below threshold'
		);
		return false;
	}

	if (hasRecentUnresolvedAlert(check.checkType)) {
		logger.debug(
			{ checkType: check.checkType },
			'Skipping alert: recent unresolved alert exists'
		);
		return false;
	}

	return true;
}

async function dispatchAlertNotifications(alertRow: {
	checkType: string;
	createdAt: Date;
	id: number;
	message: string;
	severity: string;
}): Promise<void> {
	try {
		const results = await sendAlertWithRetry({
			checkType: alertRow.checkType,
			createdAt: alertRow.createdAt,
			id: alertRow.id,
			message: alertRow.message,
			severity: alertRow.severity as 'critical' | 'warn',
		});
		const failed = results.filter((r) => !r.success);
		if (failed.length > 0) {
			logger.warn(
				{
					alertId: alertRow.id,
					failedChannels: failed.map((r) => r.channel),
					totalChannels: results.length,
				},
				'Alert notification completed with some failures'
			);
		} else if (results.length > 0) {
			logger.info(
				{ alertId: alertRow.id, channels: results.map((r) => r.channel) },
				'Alert notifications sent successfully'
			);
		}
	} catch (err) {
		logger.error(
			{
				alertId: alertRow.id,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			'Alert notification failed'
		);
	}
}

export function createAlertAndNotify(check: HealthCheckInput): void {
	if (!shouldCreateAlert(check)) {
		return;
	}

	const db = getDb();
	const alertRow = db
		.insert(healthCheckAlerts)
		.values({
			checkType: check.checkType,
			message: `${check.checkType} check ${check.status}: ${JSON.stringify(check.details)}`,
			severity: check.status === 'unhealthy' ? 'critical' : 'warn',
		})
		.returning()
		.get();

	if (alertRow) {
		void dispatchAlertNotifications(alertRow);
	}
}
