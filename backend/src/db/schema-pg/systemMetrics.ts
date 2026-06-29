import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { SYSTEM_METRIC_TYPES } from 'spernakit-shared';

/**
 * System metrics table (PostgreSQL variant).
 *
 * @see ../schema/systemMetrics.ts for SQLite variant and full documentation
 */
const systemMetrics = pgTable(
	'system_metrics',
	{
		cpuUsage: doublePrecision('cpu_usage'),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		diskUsage: doublePrecision('disk_usage'),
		eventLoopLatency: doublePrecision('event_loop_latency'),
		heapTotal: integer('heap_total'),
		heapUsed: integer('heap_used'),
		id: serial('id').primaryKey(),
		memoryUsage: doublePrecision('memory_usage'),
		metadata: jsonb('metadata'),
		metricType: text('metric_type', { enum: SYSTEM_METRIC_TYPES }).notNull(),
		rss: integer('rss'),
		value: doublePrecision('value'),
	},
	(table) => [
		index('idx_system_metrics_metric_type').on(table.metricType),
		index('idx_system_metrics_created_at').on(table.createdAt),
		index('idx_system_metrics_type_created').on(table.metricType, table.createdAt),
	]
);

export { systemMetrics };
