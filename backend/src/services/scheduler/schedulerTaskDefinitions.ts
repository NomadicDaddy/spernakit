import { getConfig } from '../../config/configLoader.ts';
import {
	AUDIT_LOG_ARCHIVE_INTERVAL_HOURS,
	BUSINESS_EVENTS_CLEANUP_INTERVAL_HOURS,
	DATABASE_VACUUM_INTERVAL_HOURS,
	HEALTH_CHECK_CLEANUP_INTERVAL_HOURS,
	HEALTH_CHECK_EXECUTION_INTERVAL_MINUTES,
	NOTIFICATIONS_CLEANUP_INTERVAL_HOURS,
	SOFT_DELETED_FILES_CLEANUP_INTERVAL_HOURS,
	SYSTEM_METRICS_CLEANUP_INTERVAL_HOURS,
} from '../../constants/scheduler.ts';
import {
	auditLogCleanupTask,
	businessEventsCleanupTask,
	healthCheckCleanupTask,
	notificationsCleanupTask,
	rateLimitCleanupTask,
	softDeletedFilesCleanupTask,
	systemMetricsCleanupTask,
	tokenCleanupTask,
} from './schedulerCleanupExecutor.ts';
import {
	databaseBackupTask,
	databaseIntegrityCheckTask,
	databaseVacuumTask,
} from './schedulerMaintenanceExecutor.ts';
import { healthCheckExecutionTask, metricsCollectionTask } from './schedulerMetricsExecutor.ts';
import { registerTask } from './schedulerRegistry.ts';

/**
 * Build the list of task definitions to register.
 *
 * @returns Array of task definitions
 */
function getBuiltInTaskDefinitions(): {
	cronExpression: string;
	enabled: boolean;
	handler: () => unknown;
	name: string;
}[] {
	const config = getConfig();
	const isSqlite = config.database.dialect === 'sqlite';

	return [
		{
			cronExpression: `${config.tokenCleanup.intervalHours}h`,
			enabled: config.tokenCleanup.enabled,
			handler: tokenCleanupTask,
			name: 'token-cleanup',
		},
		{
			cronExpression: `${HEALTH_CHECK_CLEANUP_INTERVAL_HOURS}h`,
			enabled: true,
			handler: healthCheckCleanupTask,
			name: 'health-check-cleanup',
		},
		{
			cronExpression: `${HEALTH_CHECK_EXECUTION_INTERVAL_MINUTES}m`,
			enabled: true,
			handler: healthCheckExecutionTask,
			name: 'health-check-execution',
		},
		{
			cronExpression: `${AUDIT_LOG_ARCHIVE_INTERVAL_HOURS}h`,
			enabled: true,
			handler: auditLogCleanupTask,
			name: 'audit-log-archive',
		},
		{
			cronExpression: `${SYSTEM_METRICS_CLEANUP_INTERVAL_HOURS}h`,
			enabled: true,
			handler: systemMetricsCleanupTask,
			name: 'system-metrics-cleanup',
		},
		{
			cronExpression: `${BUSINESS_EVENTS_CLEANUP_INTERVAL_HOURS}h`,
			enabled: true,
			handler: businessEventsCleanupTask,
			name: 'business-events-cleanup',
		},
		{
			cronExpression: `${NOTIFICATIONS_CLEANUP_INTERVAL_HOURS}h`,
			enabled: true,
			handler: notificationsCleanupTask,
			name: 'notifications-cleanup',
		},
		{
			cronExpression: `${SOFT_DELETED_FILES_CLEANUP_INTERVAL_HOURS}h`,
			enabled: true,
			handler: softDeletedFilesCleanupTask,
			name: 'soft-deleted-files-cleanup',
		},
		{
			cronExpression: '1m',
			enabled: true,
			handler: rateLimitCleanupTask,
			name: 'rate-limit-cleanup',
		},
		{
			cronExpression: `${config.metrics.collectionIntervalMs}ms`,
			enabled: true,
			handler: metricsCollectionTask,
			name: 'metrics-collection',
		},
		{
			cronExpression: `${config.database.vacuum.intervalHours || DATABASE_VACUUM_INTERVAL_HOURS}h`,
			enabled: isSqlite && config.database.vacuum.enabled,
			handler: databaseVacuumTask,
			name: 'database-vacuum',
		},
		{
			cronExpression: `${config.database.backup.intervalHours}h`,
			enabled: isSqlite && config.database.backup.enabled,
			handler: databaseBackupTask,
			name: 'database-backup',
		},
		{
			cronExpression: `${config.database.integrityCheck.intervalHours}h`,
			enabled: isSqlite && config.database.integrityCheck.enabled,
			handler: databaseIntegrityCheckTask,
			name: 'database-integrity-check',
		},
	];
}

/** Register all built-in scheduled tasks. */
function registerBuiltInTasks(): void {
	for (const definition of getBuiltInTaskDefinitions()) {
		registerTask(definition);
	}
}

export { registerBuiltInTasks };
