import type { Column } from 'drizzle-orm';
import type { PaginatedResponse } from 'spernakit-shared';

import { sql } from 'drizzle-orm';

import { clampLimit, DEFAULT_PAGE } from '../constants/pagination.ts';

/**
 * Paginated query helper.
 * Wraps common pattern of fetching paginated data with a count.
 *
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 20)
 * @param dataFetcher - Callback to execute query with limit/offset
 * @param countFetcher - Callback to execute count query
 * @returns Paginated result with data and metadata
 *
 * Usage:
 * ```ts
 * return paginatedQuery(
 *   options.page,
 *   options.limit,
 *   (limit, offset) => db.select(...).limit(limit).offset(offset).all(),
 *   () => db.select({ count: count() }).from(table).where(where).get()
 * );
 * ```
 */
function paginatedQuery<T>(
	page: number | undefined,
	limit: number | undefined,
	dataFetcher: (limitNum: number, offsetNum: number) => T[],
	countFetcher: () => { count: number } | undefined
): PaginatedResponse<T> {
	const pageNum = Math.max(page ?? DEFAULT_PAGE, 1);
	const limitNum = clampLimit(limit);
	const offset = (pageNum - 1) * limitNum;

	const data = dataFetcher(limitNum, offset);
	const countResult = countFetcher();

	return {
		data,
		limit: limitNum,
		page: pageNum,
		total: countResult?.count ?? 0,
	};
}

/**
 * Check if a nullable value is defined (not null or undefined).
 * Type guard that narrows type to exclude null and undefined.
 *
 * @param value - Value to check
 * @returns True if value is not null or undefined
 */
function isDefined<T>(value: null | T | undefined): value is T {
	return value !== null && value !== undefined;
}

/**
 * Escape LIKE meta-characters (%, _, \) in user-supplied strings
 * to prevent LIKE wildcard injection.
 *
 * @param input - Raw user-supplied string
 * @returns Escaped string safe for LIKE pattern interpolation
 */
function escapeLikePattern(input: string): string {
	return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Build a LIKE condition with proper ESCAPE clause for SQLite.
 * SQLite ignores backslash escapes in LIKE unless ESCAPE is specified.
 *
 * @param column - Drizzle column reference
 * @param pattern - Already-escaped LIKE pattern (use escapeLikePattern for user input)
 * @returns SQL condition with ESCAPE clause
 */
function likeEscaped(column: Column, pattern: string): ReturnType<typeof sql> {
	return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

export type { PaginatedResponse };

export { escapeLikePattern, isDefined, likeEscaped, paginatedQuery };
