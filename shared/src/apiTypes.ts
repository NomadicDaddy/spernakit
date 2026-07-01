/**
 * Standardized API response envelope types shared between backend and frontend.
 *
 * Response shapes:
 * - Single resource: { data: T }
 * - List (non-paginated): { data: T[] }
 * - Mutation success: { data: null }
 * - Paginated list: { data: T[], page, limit, total }
 * - Error: { error, code, message, requestId?, details? }
 */

import type { ErrorCode } from './errorCodes.ts';

/** Standard data response envelope for single resources and non-paginated lists. */
interface DataResponse<T> {
	data: T;
}

/** Paginated response envelope for list endpoints. */
interface PaginatedResponse<T> {
	data: T[];
	limit: number;
	page: number;
	total: number;
}

/** Success response for mutations with no meaningful return value. */
interface SuccessResponse {
	data: null;
}

/**
 * Standard error response structure returned by all API endpoints.
 *
 * Both `code` and `message` are always provided by the backend.
 * The `code` field allows clients to programmatically handle specific error
 * conditions without relying on parsing error message strings.
 */
interface ErrorResponse {
	/** Machine-readable error code for programmatic handling. */
	code: ErrorCode;
	/** Additional error context (e.g., validation details, retry info). */
	details?: Record<string, unknown>;
	/** Human-readable error title. */
	error: string;
	/** Detailed description of the error. */
	message: string;
	/** Request correlation ID for tracing. */
	requestId?: string;
}

/** Bulk operation result with per-item status. */
interface BulkOperationResult {
	failed: number;
	results: {
		error?: string;
		success: boolean;
		userId?: number;
	}[];
	succeeded: number;
	total: number;
}

export type {
	BulkOperationResult,
	DataResponse,
	ErrorResponse,
	PaginatedResponse,
	SuccessResponse,
};
