/**
 * Dashboard widget and metric type identifiers. The const arrays are the
 * runtime source of truth; the literal union types are derived from them so
 * the list and type cannot drift.
 *
 * Widget type defines the visualization kind rendered on a dashboard:
 * - line_chart: Time-series area/line chart (CPU, memory, request count)
 * - bar_chart: Categorical comparison bar chart
 * - gauge: Single value with threshold (CPU %, memory %)
 * - stat_card: Single metric with optional trend indicator
 * - table: Tabular data (recent logs, events, metrics)
 * - health_status: Overall system health summary
 * - alert_list: Active health check alerts
 *
 * Metric type identifies the data source for a widget.
 *
 * Add a new type by appending to the relevant array — the Drizzle schema enum
 * (SQLite + PostgreSQL), the TypeBox route schemas, and the frontend API
 * types all reference these constants.
 */

const WIDGET_TYPES = [
	'alert_list',
	'bar_chart',
	'gauge',
	'health_status',
	'line_chart',
	'stat_card',
	'table',
] as const;

type WidgetType = (typeof WIDGET_TYPES)[number];

const METRIC_TYPES = [
	'active_connections',
	'audit_events',
	'business_events',
	'cpu_usage',
	'health_checks',
	'health_status',
	'memory_usage',
	'request_count',
	'system_alerts',
	'total_users',
] as const;

type MetricType = (typeof METRIC_TYPES)[number];

export { METRIC_TYPES, WIDGET_TYPES };
export type { MetricType, WidgetType };
