/**
 * Metric types used by the system_metrics table.
 *
 * Unlike METRIC_TYPES (which are dashboard widget data sources), these identify
 * the category of a machine-generated system-level measurement.
 *
 * Static types:
 * - system: Overall system health snapshot (CPU, memory, disk combined)
 * - database_integrity: Database integrity check results
 *
 * Web-vital types follow the pattern `web-vital-{name}` where {name} is the
 * lowercase metric identifier from the `web-vitals` library:
 * - web-vital-cls: Cumulative Layout Shift
 * - web-vital-fcp: First Contentful Paint
 * - web-vital-inp: Interaction to Next Paint
 * - web-vital-lcp: Largest Contentful Paint
 * - web-vital-ttfb: Time to First Byte
 *
 * If the web-vitals library adds new metrics, append the corresponding
 * `web-vital-*` entry here.
 */
const SYSTEM_METRIC_TYPES = [
	'database_integrity',
	'system',
	'web-vital-cls',
	'web-vital-fcp',
	'web-vital-inp',
	'web-vital-lcp',
	'web-vital-ttfb',
] as const;

type SystemMetricType = (typeof SYSTEM_METRIC_TYPES)[number];

export { SYSTEM_METRIC_TYPES };
export type { SystemMetricType };
