import { and, desc, eq, gte, isNull } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';
import { logger } from '../../utils/logger.ts';
import { sendAlertWithRetry } from '../notificationService.ts';
import { getHealthConfig } from './healthConfigService.ts';

const ALERT_DEDUP_MINUTES = 15;
const SEVERITY_ORDER = { degraded: 1, unhealthy: 2 } as const;

interface HealthCheckInput {
	checkType: string;
	details?: Record<string, unknown>;
	status: string;
}

function hasRecentUnresolvedAlert(checkType: string): boolean {
	const cutoff = new Date(Date.now() - ALERT_DEDUP_MINUTES * 60 * 1000);
	return (
		getDb()
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
			.get() !== undefined
	);
}

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

async function dispatchAlertNotifications(alert: {
	checkType: string;
	createdAt: Date;
	id: number;
	message: string;
	severity: string;
}): Promise<void> {
	try {
		const results = await sendAlertWithRetry({
			checkType: alert.checkType,
			createdAt: alert.createdAt,
			id: alert.id,
			message: alert.message,
			severity: alert.severity as 'critical' | 'warn',
		});
		const failed = results.filter((result) => !result.success);
		if (failed.length > 0) {
			logger.warn(
				{
					alertId: alert.id,
					failedChannels: failed.map((result) => result.channel),
					totalChannels: results.length,
				},
				'Alert notification completed with some failures'
			);
		} else if (results.length > 0) {
			logger.info(
				{ alertId: alert.id, channels: results.map((result) => result.channel) },
				'Alert notifications sent successfully'
			);
		}
	} catch (err) {
		logger.error(
			{
				alertId: alert.id,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			'Alert notification failed'
		);
	}
}

function createAlertAndNotify(check: HealthCheckInput): void {
	if (!shouldCreateAlert(check)) return;

	const alert = getDb()
		.insert(healthCheckAlerts)
		.values({
			checkType: check.checkType,
			message: `${check.checkType} check ${check.status}: ${JSON.stringify(check.details)}`,
			severity: check.status === 'unhealthy' ? 'critical' : 'warn',
		})
		.returning()
		.get();

	if (alert) void dispatchAlertNotifications(alert);
}

export { createAlertAndNotify };
