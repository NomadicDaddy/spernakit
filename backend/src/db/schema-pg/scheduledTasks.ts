import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { SCHEDULED_TASK_STATUSES } from 'spernakit-shared';

// DB-level domain guard: keep the CHECK list single-sourced from SCHEDULED_TASK_STATUSES.
const SCHEDULED_TASK_STATUS_IN_LIST = SCHEDULED_TASK_STATUSES.map((status) => `'${status}'`).join(
	', '
);

/**
 * Scheduled task executions table (PostgreSQL variant).
 *
 * @see ../schema/scheduledTasks.ts for SQLite variant and full documentation
 */
const scheduledTaskExecutions = pgTable(
	'scheduled_task_executions',
	{
		completedAt: timestamp('completed_at', { mode: 'date' }),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		durationMs: integer('duration_ms'),
		error: text('error'),
		id: serial('id').primaryKey(),
		result: jsonb('result'),
		startedAt: timestamp('started_at', { mode: 'date' }).notNull(),
		status: text('status', { enum: SCHEDULED_TASK_STATUSES }).notNull().default('pending'),
		taskName: text('task_name').notNull(),
	},
	(table) => [
		check(
			'chk_scheduled_task_executions_status',
			sql`${table.status} in (${sql.raw(SCHEDULED_TASK_STATUS_IN_LIST)})`
		),
		index('idx_scheduled_task_executions_task_name').on(table.taskName),
		index('idx_scheduled_task_executions_status').on(table.status),
		index('idx_scheduled_task_executions_created_at').on(table.createdAt),
		index('idx_scheduled_task_executions_name_created').on(table.taskName, table.createdAt),
	]
);

/**
 * Scheduled task configuration overrides (PostgreSQL variant).
 *
 * @see ../schema/scheduledTasks.ts for SQLite variant and full documentation
 */
const scheduledTaskConfigs = pgTable(
	'scheduled_task_configs',
	{
		cronExpression: text('cron_expression').notNull(),
		enabled: boolean('enabled').notNull(),
		id: serial('id').primaryKey(),
		taskName: text('task_name').notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [uniqueIndex('idx_scheduled_task_configs_task_name').on(table.taskName)]
);

export { scheduledTaskConfigs, scheduledTaskExecutions };
