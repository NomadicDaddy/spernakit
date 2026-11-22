import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';
import { logger } from '../../utils/logger.ts';
import { isReminderDue, markAlertNotified, sendAlertWithRetry } from '../notificationService.ts';
import { getHealthConfig } from './healthConfigService.ts';

const SEVERITY_ORDER = { degraded: 1, unhealthy: 2 } as const;

interface HealthCheckInput {
	checkType: string;
	details?: Record<string, unknown>;
	status: string;
}

type AlertRow = typeof healthCheckAlerts.$inferSelect;
type AlertSeverity = 'critical' | 'warn';

function alertSeverityFor(status: string): AlertSeverity {
	return status === 'unhealthy' ? 'critical' : 'warn';
}

/**
 * Resolve the given unresolved alerts now.
 *
 * @param ids - Alert ids to resolve
 */
function resolveAlerts(ids: number[]): void {
	if (ids.length === 0) return;
	getDb()
		.update(healthCheckAlerts)
		.set({ resolvedAt: new Date() })
		.where(and(inArray(healthCheckAlerts.id, ids), isNull(healthCheckAlerts.resolvedAt)))
		.run();
}

function unresolvedAlertsFor(checkType: string): AlertRow[] {
	return getDb()
		.select()
		.from(healthCheckAlerts)
		.where(
			and(eq(healthCheckAlerts.checkType, checkType), isNull(healthCheckAlerts.resolvedAt)),
		)
		.orderBy(desc(healthCheckAlerts.createdAt), desc(healthCheckAlerts.id))
		.all();
}

/**
 * The one unresolved alert of this check type. Any older unresolved rows of the type, as apps
 * hold from before one row per condition, are resolved here so they collapse to the newest.
 *
 * @param checkType - The health check type
 * @returns The open alert, or undefined when none is open
 */
function openAlertFor(checkType: string): AlertRow | undefined {
	const [newest, ...older] = unresolvedAlertsFor(checkType);
	if (older.length > 0) {
		resolveAlerts(older.map((alert) => alert.id));
		logger.info(
			{ checkType, collapsed: older.length, keptAlertId: newest?.id },
			'Collapsed duplicate open health alerts to the newest',
		);
	}
	return newest;
}

/**
 * Whether a degraded or unhealthy result is at or above the configured alert threshold, so it may
 * open a new alert.
 *
 * @param check - The health check result
 * @returns True when a new alert may be recorded
 */
function meetsAlertThreshold(check: HealthCheckInput): boolean {
	const checkSeverity = SEVERITY_ORDER[check.status as keyof typeof SEVERITY_ORDER] ?? 0;
	const thresholdSeverity = SEVERITY_ORDER[getHealthConfig().alertThreshold] ?? 1;
	return checkSeverity >= thresholdSeverity;
}

async function dispatchAlertNotifications(alert: AlertRow): Promise<void> {
	try {
		const results = await sendAlertWithRetry({
			checkType: alert.checkType,
			createdAt: alert.createdAt,
			id: alert.id,
			message: alert.message,
			severity: alert.severity as AlertSeverity,
		});
		// Only a delivered send moves notifiedAt. One no channel delivered leaves it as it was, so
		// the reminder stays due and the next check run retries it.
		if (results.some((result) => result.success)) markAlertNotified(alert.id);
		const failed = results.filter((result) => !result.success);
		if (failed.length > 0) {
			logger.warn(
				{
					alertId: alert.id,
					failedChannels: failed.map((result) => result.channel),
					totalChannels: results.length,
				},
				'Alert notification completed with some failures',
			);
		} else if (results.length > 0) {
			logger.info(
				{ alertId: alert.id, channels: results.map((result) => result.channel) },
				'Alert notifications sent successfully',
			);
		}
	} catch (err) {
		logger.error(
			{
				alertId: alert.id,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			'Alert notification failed',
		);
	}
}

function openAlert(check: HealthCheckInput, severity: AlertSeverity): void {
	const alert = getDb()
		.insert(healthCheckAlerts)
		.values({
			checkType: check.checkType,
			message: `${check.checkType} check ${check.status}: ${JSON.stringify(check.details)}`,
			severity,
		})
		.returning()
		.get();
	if (alert) void dispatchAlertNotifications(alert);
}

/**
 * Bring a check type's alert in line with its latest result. Both health-check consumers call this
 * for every result, healthy ones included.
 *
 * - Healthy: the type's unresolved alerts are resolved.
 * - Degraded or unhealthy: the type keeps exactly one unresolved row. With none open, a new row is
 *   recorded and sent at once. Escalating from warning to critical resolves the warning and opens a
 *   critical row, sent at once. Otherwise the open row stays, keeping its severity when a check
 *   falls back, and a reminder is sent from it once per alerting.cooldownMinutes, measured from its
 *   last successful delivery.
 *
 * @param check - The latest result for one check type
 */
function syncCheckAlert(check: HealthCheckInput): void {
	if (check.status === 'healthy') {
		resolveAlerts(unresolvedAlertsFor(check.checkType).map((alert) => alert.id));
		return;
	}
	if (!getHealthConfig().alertsEnabled) {
		logger.debug({ checkType: check.checkType }, 'Skipping alert: alerts are disabled');
		return;
	}
	syncFailingCheck(check);
}

/**
 * The degraded or unhealthy half of syncCheckAlert: open, escalate, or remind from the one open row.
 *
 * @param check - A degraded or unhealthy result
 */
function syncFailingCheck(check: HealthCheckInput): void {
	const severity = alertSeverityFor(check.status);
	const current = openAlertFor(check.checkType);

	if (!current) {
		if (meetsAlertThreshold(check)) openAlert(check, severity);
		return;
	}
	if (current.severity === 'warn' && severity === 'critical') {
		resolveAlerts([current.id]);
		openAlert(check, severity);
		return;
	}
	if (isReminderDue(current.notifiedAt, getConfig().alerting.cooldownMinutes)) {
		void dispatchAlertNotifications(current);
	}
}

export { syncCheckAlert };
