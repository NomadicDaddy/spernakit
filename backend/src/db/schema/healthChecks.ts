import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { HEALTH_ALERT_SEVERITIES, HEALTH_STATUSES } from 'spernakit-shared';

import { users } from './users.ts';

const HEALTH_ALERT_SEVERITY_IN_LIST = HEALTH_ALERT_SEVERITIES.map(
	(severity) => `'${severity}'`
).join(', ');
const HEALTH_STATUS_IN_LIST = HEALTH_STATUSES.map((status) => `'${status}'`).join(', ');

/**
 * Health check logs table for recording periodic health check results.
 *
 * Intentional omissions:
 * - No soft delete: System-generated diagnostic records — deletion handled by retention cleanup.
 * - No createdBy/updatedBy: Machine-generated records with no human actor.
 *
 * The application runs automated health checks (database, memory, filesystem) at
 * configurable intervals. Each check execution is recorded here for historical
 * analysis and trend monitoring.
 *
 * Check types:
 * - database: Tests database connectivity and query performance
 * - memory: Monitors heap usage and memory pressure
 * - filesystem: Verifies file system read/write access
 *
 * Status values:
 * - healthy: Check passed within normal thresholds
 * - degraded: Check passed but with warnings (e.g., high memory usage)
 * - unhealthy: Check failed or exceeded critical thresholds
 *
 * Indexes:
 * - idx_health_check_logs_check_type: Filtering by specific check type
 * - idx_health_check_logs_status: Filtering by health status
 * - idx_health_check_logs_created_at: Time-range queries for history
 */
const healthCheckLogs = sqliteTable(
	'health_check_logs',
	{
		checkType: text('check_type').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		details: text('details', { mode: 'json' }),
		durationMs: integer('duration_ms'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		status: text('status', { enum: HEALTH_STATUSES }).notNull(),
	},
	(table) => [
		check(
			'chk_health_check_logs_status',
			sql`${table.status} in (${sql.raw(HEALTH_STATUS_IN_LIST)})`
		),
		// DB-level integrity guard: reject malformed JSON in the json-mode `details` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_health_check_logs_details_json', sql`json_valid(${table.details})`),
		index('idx_health_check_logs_check_type').on(table.checkType),
		index('idx_health_check_logs_status').on(table.status),
		index('idx_health_check_logs_created_at').on(table.createdAt),
	]
);

/**
 * Health check alerts table for tracking unresolved health issues.
 *
 * Intentional omissions:
 * - No soft delete: Alerts are resolved (resolvedAt), not soft-deleted.
 * - No createdBy/updatedBy: System-generated alerts. acknowledgedBy tracks human interaction.
 *
 * When a health check detects a problem (degraded or unhealthy status), an alert
 * is created to track the issue until it is resolved. Alerts trigger notifications
 * to administrators via email, webhook, and in-app notification channels.
 *
 * Severity levels:
 * - warn: Degraded performance, non-critical issue (e.g., high memory usage)
 * - critical: Unhealthy status, immediate attention required (e.g., database down)
 *
 * Lifecycle:
 * - Alert created when health check fails or degrades
 * - acknowledgedAt and acknowledgedBy set when admin marks alert as seen
 * - resolvedAt set when issue is manually resolved or auto-resolved
 * - Unresolved alerts (resolvedAt IS NULL) are displayed in System Health UI
 * - Acknowledged but unresolved alerts are still shown with acknowledged status
 *
 * Indexes:
 * - idx_health_check_alerts_check_type: Filtering alerts by check type
 * - idx_health_check_alerts_severity: Filtering by severity level
 * - idx_health_check_alerts_resolved_at: Finding unresolved alerts
 * - idx_health_check_alerts_resolved_created: Unresolved-alert listing ordered by creation time
 * - idx_health_check_alerts_check_resolved_created: Recent-alert deduplication and cooldown checks
 */
const healthCheckAlerts = sqliteTable(
	'health_check_alerts',
	{
		acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }),
		acknowledgedBy: integer('acknowledged_by'),
		checkType: text('check_type').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: integer('id').primaryKey({ autoIncrement: true }),
		message: text('message').notNull(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
		severity: text('severity', { enum: HEALTH_ALERT_SEVERITIES }).notNull(),
	},
	(table) => [
		check(
			'chk_health_check_alerts_severity',
			sql`${table.severity} in (${sql.raw(HEALTH_ALERT_SEVERITY_IN_LIST)})`
		),
		foreignKey({
			columns: [table.acknowledgedBy],
			foreignColumns: [users.id],
			name: 'fk_health_check_alerts_acknowledged_by_users',
		}).onDelete('set null'),
		index('idx_health_check_alerts_check_type').on(table.checkType),
		index('idx_health_check_alerts_severity').on(table.severity),
		index('idx_health_check_alerts_resolved_at').on(table.resolvedAt),
		index('idx_health_check_alerts_resolved_created').on(table.resolvedAt, table.createdAt),
		index('idx_health_check_alerts_check_resolved_created').on(
			table.checkType,
			table.resolvedAt,
			table.createdAt
		),
	]
);

export { healthCheckAlerts, healthCheckLogs };
