import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { SCHEDULED_TASK_STATUSES } from 'spernakit-shared';

// DB-level domain guard: keep the CHECK list single-sourced from SCHEDULED_TASK_STATUSES.
const SCHEDULED_TASK_STATUS_IN_LIST = SCHEDULED_TASK_STATUSES.map((status) => `'${status}'`).join(
	', '
);

/**
 * Scheduled task executions table for tracking cron job history.
 *
 * Intentional omissions:
 * - No soft delete: Execution records are append-only — deletion handled by retention cleanup.
 * - No createdBy/updatedBy: Machine-triggered executions with no human actor.
 *
 * The application scheduler runs various background tasks (metrics collection,
 * health checks, cleanup operations, database backups) on configurable intervals.
 * Each execution is recorded for monitoring, debugging, and auditing purposes.
 *
 * Task lifecycle:
 * 1. Task starts: Record created with status='pending' and startedAt timestamp
 * 2. Task runs: Status updated to 'running'
 * 3. Task completes: Status='completed', completedAt set, durationMs calculated
 * 4. Task fails: Status='failed', error message recorded
 *
 * Common task names:
 * - metrics-collection: Periodic system metrics gathering
 * - health-check-cleanup: Cleanup old health check logs and alerts
 * - database-backup: Automated database backup creation
 * - database-integrity-check: SQLite PRAGMA integrity check
 * - token-cleanup: Expired password reset token removal
 *
 * Indexes:
 * - idx_scheduled_task_executions_task_name: Filtering by specific task
 * - idx_scheduled_task_executions_status: Finding running or failed tasks
 * - idx_scheduled_task_executions_created_at: Time-range queries for history
 */
const scheduledTaskExecutions = sqliteTable(
	'scheduled_task_executions',
	{
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		durationMs: integer('duration_ms'),
		error: text('error'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		result: text('result', { mode: 'json' }),
		startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
		status: text('status', { enum: SCHEDULED_TASK_STATUSES }).notNull().default('pending'),
		taskName: text('task_name').notNull(),
	},
	(table) => [
		check(
			'chk_scheduled_task_executions_status',
			sql`${table.status} in (${sql.raw(SCHEDULED_TASK_STATUS_IN_LIST)})`
		),
		// DB-level integrity guard: reject malformed JSON in the json-mode `result` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_scheduled_task_executions_result_json', sql`json_valid(${table.result})`),
		index('idx_scheduled_task_executions_task_name').on(table.taskName),
		index('idx_scheduled_task_executions_status').on(table.status),
		index('idx_scheduled_task_executions_created_at').on(table.createdAt),
		index('idx_scheduled_task_executions_name_created').on(table.taskName, table.createdAt),
	]
);

/**
 * Scheduled task configuration overrides.
 *
 * Persists admin-managed overrides for cronExpression and enabled state.
 * Tasks not present in this table use their built-in defaults from code.
 * When an admin changes a schedule or toggles a task, the override is
 * written here and the in-memory scheduler is updated at runtime.
 */
const scheduledTaskConfigs = sqliteTable(
	'scheduled_task_configs',
	{
		cronExpression: text('cron_expression').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		taskName: text('task_name').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [uniqueIndex('idx_scheduled_task_configs_task_name').on(table.taskName)]
);

export { scheduledTaskConfigs, scheduledTaskExecutions };
