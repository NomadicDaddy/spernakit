import { isNotNull } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import { healthCheckAlerts, healthCheckLogs } from '../../db/schema/healthChecks.ts';
import { scheduledTaskExecutions } from '../../db/schema/scheduledTasks.ts';
import { logScheduler } from '../../utils/logger.ts';
import { log as logAudit } from '../auditService.ts';
import { getHealthConfig } from '../health/healthConfigService.ts';
import { createRetentionCleanupTask } from './cleanupUtils.ts';

function cleanupHealthCheckLogs(retentionDays: number): { cleaned: number } {
	return createRetentionCleanupTask({
		getRetentionDays: () => retentionDays,
		table: healthCheckLogs as never,
		taskName: 'health-check-cleanup-logs',
	})();
}

function cleanupHealthCheckAlerts(retentionDays: number): { cleaned: number } {
	return createRetentionCleanupTask({
		extraCondition: isNotNull(healthCheckAlerts.resolvedAt),
		getRetentionDays: () => retentionDays,
		table: healthCheckAlerts as never,
		taskName: 'health-check-cleanup-alerts',
	})();
}

function cleanupTaskExecutions(retentionDays: number): { cleaned: number } {
	return createRetentionCleanupTask({
		getRetentionDays: () => retentionDays,
		table: scheduledTaskExecutions as never,
		taskName: 'health-check-cleanup-executions',
	})();
}

function healthCheckCleanupTask(): { cleaned: number } {
	const config = getConfig();
	const healthConfig = getHealthConfig();
	// DB settings (healthConfig) is the single source of truth for log retention
	const logsCleanup = cleanupHealthCheckLogs(healthConfig.logRetentionDays);
	const alertsCleanup = cleanupHealthCheckAlerts(config.retention.healthCheckAlertsDays);
	const execCleanup = cleanupTaskExecutions(config.retention.scheduledTaskExecutionsDays);

	const cleaned = logsCleanup.cleaned + alertsCleanup.cleaned + execCleanup.cleaned;
	logScheduler('info', 'Health check cleanup task completed', {
		alertsCleaned: alertsCleanup.cleaned,
		executionsCleaned: execCleanup.cleaned,
		logsCleaned: logsCleanup.cleaned,
	});

	if (cleaned > 0) {
		logAudit({
			action: 'SYSTEM_CLEANUP health_check_data',
			details: {
				alertsCleaned: alertsCleanup.cleaned,
				alertsRetentionDays: config.retention.healthCheckAlertsDays,
				executionsCleaned: execCleanup.cleaned,
				executionsRetentionDays: config.retention.scheduledTaskExecutionsDays,
				logsCleaned: logsCleanup.cleaned,
				logsRetentionDays: healthConfig.logRetentionDays,
			},
			entityType: 'health_check_logs',
		});
	}

	return { cleaned };
}

export { healthCheckCleanupTask };
