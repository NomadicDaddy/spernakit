import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { HEALTH_ALERT_SEVERITIES, HEALTH_STATUSES } from 'spernakit-shared';

import { users } from './users.ts';

const HEALTH_ALERT_SEVERITY_IN_LIST = HEALTH_ALERT_SEVERITIES.map(
	(severity) => `'${severity}'`
).join(', ');
const HEALTH_STATUS_IN_LIST = HEALTH_STATUSES.map((status) => `'${status}'`).join(', ');

/**
 * Health check logs table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/healthChecks.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp', text with mode: 'json'
 * - PostgreSQL: native timestamp/jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/healthChecks.ts for SQLite variant and full documentation
 */
const healthCheckLogs = pgTable(
	'health_check_logs',
	{
		checkType: text('check_type').notNull(),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		details: jsonb('details'),
		durationMs: integer('duration_ms'),
		id: serial('id').primaryKey(),
		status: text('status', { enum: HEALTH_STATUSES }).notNull(),
	},
	(table) => [
		check(
			'chk_health_check_logs_status',
			sql`${table.status} in (${sql.raw(HEALTH_STATUS_IN_LIST)})`
		),
		index('idx_health_check_logs_check_type').on(table.checkType),
		index('idx_health_check_logs_status').on(table.status),
		index('idx_health_check_logs_created_at').on(table.createdAt),
	]
);

/**
 * Health check alerts table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/healthChecks.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'
 * - PostgreSQL: native timestamp types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/healthChecks.ts for SQLite variant and full documentation
 */
const healthCheckAlerts = pgTable(
	'health_check_alerts',
	{
		acknowledgedAt: timestamp('acknowledged_at', { mode: 'date' }),
		acknowledgedBy: integer('acknowledged_by'),
		checkType: text('check_type').notNull(),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: serial('id').primaryKey(),
		message: text('message').notNull(),
		resolvedAt: timestamp('resolved_at', { mode: 'date' }),
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
