/**
 * Log categories for structured logging.
 *
 * These categories enable:
 * - Filtering logs by category in log aggregation services (Elasticsearch, Loki)
 * - Category-based alerting (e.g., alert on auth failures)
 * - Different retention policies by category
 * - Easier debugging by searching specific categories
 *
 * @example
 * ```typescript
 * import { LogCategory } from './logCategories.ts';
 * import { logWithCategory } from './logger.ts';
 *
 * logWithCategory('info', LogCategory.AUTH, 'User logged in', { userId: 123 });
 * ```
 */
const LogCategory = {
	/** API request/response logging */
	API: 'api',

	/** Authentication and authorization events */
	AUTH: 'auth',

	/** Database operations and queries */
	DATABASE: 'database',

	/** Scheduled task operations */
	SCHEDULER: 'scheduler',
} as const;

type LogCategoryType = (typeof LogCategory)[keyof typeof LogCategory];

export { LogCategory, type LogCategoryType };
