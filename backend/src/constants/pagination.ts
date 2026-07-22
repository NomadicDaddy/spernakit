const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE = 1;

/** Default time window for metrics queries (hours) */
const DEFAULT_METRICS_HOURS = 24;

/** Maximum time window for metrics queries (7 days in hours) */
const MAX_METRICS_HOURS = 168;

/** Maximum number of items in a single batch operation */
const MAX_BATCH_SIZE = 100;

function clampLimit(limit: number | undefined): number {
	const val = limit ?? DEFAULT_PAGE_LIMIT;
	return Math.min(Math.max(1, val), MAX_PAGE_LIMIT);
}

export {
	clampLimit,
	DEFAULT_METRICS_HOURS,
	DEFAULT_PAGE,
	DEFAULT_PAGE_LIMIT,
	MAX_BATCH_SIZE,
	MAX_METRICS_HOURS,
	MAX_PAGE_LIMIT,
};
