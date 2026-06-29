/** Heap usage percentage threshold above which memory status is 'unhealthy' */
const MEMORY_HEAP_UNHEALTHY_THRESHOLD = 0.95;

/** Heap usage percentage threshold above which memory status is 'degraded' */
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
