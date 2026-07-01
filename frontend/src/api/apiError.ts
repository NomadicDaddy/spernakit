import type { ErrorCode } from './types';

/**
 * API error with status code and optional error code for programmatic handling.
 *
 * @example
 * try {
 *   await apiClient.post('/auth/login', { body: credentials });
 * } catch (err) {
 *   if (err instanceof ApiError && err.code === 'AUTH_INVALID_CREDENTIALS') {
 *     // Handle invalid credentials specifically
 *   }
 * }
 */
class ApiError extends Error {
	readonly status: number;
	readonly code: ErrorCode | undefined;
	readonly requestId: string | undefined;
	readonly details: Record<string, unknown> | undefined;

	constructor(
		message: string,
		status: number,
		code?: ErrorCode,
		requestId?: string,
		details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.requestId = requestId;
		this.details = details;
	}

	hasCode(code: ErrorCode): boolean {
		return this.code === code;
	}

	hasAnyCode(...codes: ErrorCode[]): boolean {
		return this.code !== undefined && codes.includes(this.code);
	}
}

interface RequestOptions {
	body?: unknown;
	headers?: Record<string, string>;
	method?: string;
	params?: Record<string, string>;
	/** Retry on transient errors (429, 5xx). Defaults to true for GET, false for mutations. */
	retry5xx?: boolean;
	timeout?: number;
}

export { ApiError, type RequestOptions };
