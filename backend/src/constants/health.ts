/**
 * Fraction of the memory limit in use above which memory status is 'unhealthy'. The setting keys
 * these defaults feed are still named memoryHeap...; see services/health/memoryUsage.ts for why the
 * measurement moved off the heap and the names did not.
 */
const MEMORY_HEAP_UNHEALTHY_THRESHOLD = 0.95;

/** Fraction of the memory limit in use above which memory status is 'degraded'. */
const MEMORY_HEAP_DEGRADED_THRESHOLD = 0.85;

/** Free disk space percentage threshold below which disk status is 'unhealthy' */
const DISK_SPACE_UNHEALTHY_THRESHOLD = 0.05;

/** Free disk space percentage threshold below which disk status is 'degraded' */
const DISK_SPACE_DEGRADED_THRESHOLD = 0.2;

/** Maximum number of active alerts to return */
const ACTIVE_ALERTS_LIMIT = 50;

/** Default retention policy for health check logs (days) */
const HEALTH_CHECK_LOG_RETENTION_DAYS = 30;

/** Alert threshold level values for health check configuration. */
const ALERT_THRESHOLDS = {
	degraded: 'degraded',
	unhealthy: 'unhealthy',
} as const;

export {
	ACTIVE_ALERTS_LIMIT,
	ALERT_THRESHOLDS,
	DISK_SPACE_DEGRADED_THRESHOLD,
	DISK_SPACE_UNHEALTHY_THRESHOLD,
	HEALTH_CHECK_LOG_RETENTION_DAYS,
	MEMORY_HEAP_DEGRADED_THRESHOLD,
	MEMORY_HEAP_UNHEALTHY_THRESHOLD,
};
