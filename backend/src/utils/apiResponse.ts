/**
 * Standardized API response formats for consistent endpoint behavior.
 *
 * This module provides a uniform response structure across all API endpoints:
 * - Single resource: { data: T }
 * - List (non-paginated): { data: T[] }
 * - Mutation success (including DELETE): { data: null } — returns HTTP 200, not 204,
 *   for consistent envelope parsing on the frontend
 * - Paginated list: { data: T[], page, limit, total }
 *
 * Error responses use the separate errorResponse.ts module.
 *
 * @example
 * // Single resource
 * return dataResponse(user);
 * // { data: { id: 1, name: "..." } }
 *
 * @example
 * // List of resources
 * return dataResponse(tasks);
 * // { data: [{ name: "task1" }, { name: "task2" }] }
 *
 * @example
 * // Successful mutation with no return value
 * return successResponse();
 * // { data: null }
 *
 * @example
 * // Paginated list
 * return paginatedResponse(users, { page: 1, limit: 20, total: 100 });
 * // { data: [...], page: 1, limit: 20, total: 100 }
 */

import type { DataResponse, PaginatedResponse } from 'spernakit-shared';

/**
 * Creates a standard data response envelope.
 *
 * @param data - The data to wrap in response
 * @returns Response object with data field
 *
 * @example
 * // For a user object
 * return dataResponse(user);
 * // { data: { id: 1, username: "admin" } }
 *
 * @example
 * // For a list of items
 * return dataResponse(tasks);
 * // { data: [{ name: "cleanup" }, { name: "backup" }] }
 */
function dataResponse<T>(data: T): DataResponse<T> {
	return { data };
}

/**
 * Creates a success response for mutations with no meaningful return value.
 * Standardizes { success: true } responses to { data: null }.
 *
 * @returns Response object with null data
 *
 * @example
 * // After successful deletion
 * return successResponse();
 * // { data: null }
 */
function successResponse(): DataResponse<null> {
	return { data: null };
}

/**
 * Creates a paginated response envelope, optionally replacing the data array.
 *
 * Two overloads:
 * 1. When no data replacement is needed: U = T (same type), no unsafe cast
 * 2. When replacing data with a different type: U may differ, data is required
 *
 * @param result - The paginated result from a service function
 * @param data - Replacement data array (required when transforming T to U)
 * @returns Paginated response object
 *
 * @example
 * // Same type, no transformation
 * return paginatedResponse(result);
 * // { data: [...], page: 1, limit: 20, total: 150 }
 *
 * @example
 * // Transform to different type
 * return paginatedResponse(result, projectFields(result.data, fields));
 * // { data: [projected...], page: 1, limit: 20, total: 150 }
 */
function paginatedResponse<T>(result: PaginatedResponse<T>): PaginatedResponse<T>;
function paginatedResponse<T, U>(result: PaginatedResponse<T>, data: U[]): PaginatedResponse<U>;
function paginatedResponse<T, U>(
	result: PaginatedResponse<T>,
	data?: U[]
): PaginatedResponse<T | U> {
	return {
		data: data ?? result.data,
		limit: result.limit,
		page: result.page,
		total: result.total,
	};
}

export type { DataResponse, PaginatedResponse } from 'spernakit-shared';
export { dataResponse, paginatedResponse, successResponse };
