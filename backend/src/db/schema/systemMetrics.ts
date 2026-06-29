import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { SYSTEM_METRIC_TYPES } from 'spernakit-shared';

/**
 * System metrics table for recording periodic system performance measurements.
 *
 * Intentional omissions:
 * - No soft delete: Time-series data — deletion handled by retention cleanup.
 * - No createdBy/updatedBy: Machine-generated metrics with no human actor.
 *
 * The application's metrics collector runs at configurable intervals (default: every minute)
 * to capture system resource usage. This data powers the dashboard charts, trend analysis,
 * and capacity planning features.
 *
 * Metric types (metricType field):
 * - system: Overall system health snapshot (CPU, memory, disk combined)
 * - database_integrity: Database integrity check results
 * - web-vital-*: Frontend web vitals (CLS, FCP, INP, LCP, TTFB)
 *
 * Field descriptions:
 * - value: Primary metric value (usage percentage or absolute value depending on type)
 * - cpuUsage: CPU utilization percentage (0-100)
 * - memoryUsage: Memory utilization percentage (0-100)
 * - diskUsage: Disk utilization percentage (0-100)
 * - heapTotal: Total V8 heap size in bytes
 * - heapUsed: Used V8 heap size in bytes
 * - rss: Resident Set Size - total memory allocated for the process in bytes
 * - eventLoopLatency: Node.js event loop delay in milliseconds
 * - metadata: Additional JSON data for extended metrics or context
 *
 * Retention:
 * - Raw metrics are retained for 7 days by default
 * - Aggregated hourly/daily summaries are created for long-term trending
 * - Cleanup is handled by the metrics-cleanup scheduled task
 *
 * Indexes:
 * - idx_system_metrics_metric_type: Filtering by specific metric type
 * - idx_system_metrics_created_at: Time-range queries for charts and history
 */
const systemMetrics = sqliteTable(
	'system_metrics',
	{
		cpuUsage: real('cpu_usage'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		diskUsage: real('disk_usage'),
		eventLoopLatency: real('event_loop_latency'),
		heapTotal: integer('heap_total'),
		heapUsed: integer('heap_used'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		memoryUsage: real('memory_usage'),
		metadata: text('metadata', { mode: 'json' }),
		metricType: text('metric_type', { enum: SYSTEM_METRIC_TYPES }).notNull(),
		rss: integer('rss'),
		value: real('value'),
	},
	(table) => [
		index('idx_system_metrics_metric_type').on(table.metricType),
		index('idx_system_metrics_created_at').on(table.createdAt),
		index('idx_system_metrics_type_created').on(table.metricType, table.createdAt),
	]
);

export { systemMetrics };
