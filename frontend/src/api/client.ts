import type { ErrorCode, ErrorResponse } from './types';

import { ApiError, type RequestOptions } from './apiError';
import { captureCsrfToken, getCommonHeaders, getCsrfHeader } from './requestHelpers';
import { DEFAULT_API_TIMEOUT_MS, withTimeout } from './retryHandler';
import { fetchWithRefresh } from './tokenRefresh';

class ApiClient {
	private baseUrl: string;

	constructor(baseUrl = '/api/v1') {
		this.baseUrl = baseUrl;
	}

	async get<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(path, { ...options, method: 'GET' });
	}

	async post<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(path, { ...options, csrf: true, method: 'POST' });
	}

	async put<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(path, { ...options, csrf: true, method: 'PUT' });
	}

	async patch<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(path, { ...options, csrf: true, method: 'PATCH' });
	}

	async delete<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(path, { ...options, csrf: true, method: 'DELETE' });
	}

	async postWithResponse(path: string, options?: RequestOptions): Promise<Response> {
		const url = this.buildUrl(path, options?.params);
		const timeoutMs = options?.timeout ?? DEFAULT_API_TIMEOUT_MS;
		const shouldRetry = options?.retry5xx ?? false;
		const { cleanup, signal } = withTimeout(timeoutMs);

		const headers: Record<string, string> = {
			...getCommonHeaders(),
			...getCsrfHeader(),
			...options?.headers,
		};

		const init: RequestInit = {
			headers,
			method: 'POST',
			signal,
		};

		if (options?.body !== undefined) {
			init.body = JSON.stringify(options.body);
		} else {
			delete headers['Content-Type'];
		}

		try {
			return await fetchWithRefresh(url, init, shouldRetry, timeoutMs);
		} finally {
			cleanup();
		}
	}

	async download(path: string, options?: RequestOptions): Promise<Blob> {
		const url = this.buildUrl(path, options?.params);
		const timeoutMs = options?.timeout ?? DEFAULT_API_TIMEOUT_MS;
		const shouldRetry = options?.retry5xx ?? true;
		const { cleanup, signal } = withTimeout(timeoutMs);

		try {
			const res = await fetchWithRefresh(
				url,
				{
					headers: { ...getCommonHeaders(), ...options?.headers },
					method: 'GET',
					signal,
				},
				shouldRetry,
				timeoutMs
			);

			if (!res.ok) {
				return this.handleResponse<never>(res);
			}

			return res.blob();
		} finally {
			cleanup();
		}
	}

	async upload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
		const url = this.buildUrl(path, options?.params);
		const timeoutMs = options?.timeout ?? DEFAULT_API_TIMEOUT_MS;
		const shouldRetry = options?.retry5xx ?? false;
		const { cleanup, signal } = withTimeout(timeoutMs);

		try {
			const headers: Record<string, string> = {
				...getCommonHeaders(),
				...getCsrfHeader(),
				...options?.headers,
			};
			delete headers['Content-Type'];

			const res = await fetchWithRefresh(
				url,
				{
					body: formData,
					headers,
					method: 'POST',
					signal,
				},
				shouldRetry,
				timeoutMs
			);

			return this.handleResponse<T>(res);
		} finally {
			cleanup();
		}
	}

	private buildUrl(path: string, params?: Record<string, string>): string {
		const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
		}
		return url.toString();
	}

	private async request<T>(
		path: string,
		options?: RequestOptions & { csrf?: boolean }
	): Promise<T> {
		const url = this.buildUrl(path, options?.params);
		const method = options?.method ?? 'GET';
		const timeoutMs = options?.timeout ?? DEFAULT_API_TIMEOUT_MS;
		const shouldRetry = options?.retry5xx ?? method === 'GET';
		const { cleanup, signal } = withTimeout(timeoutMs);

		try {
			const headers: Record<string, string> = {
				...getCommonHeaders(),
				...(options?.csrf ? getCsrfHeader() : {}),
				...options?.headers,
			};

			const init: RequestInit = {
				headers,
				method,
				signal,
			};

			if (options?.body !== undefined && method !== 'GET') {
				init.body = JSON.stringify(options.body);
			} else {
				delete headers['Content-Type'];
			}

			const res = await fetchWithRefresh(url, init, shouldRetry, timeoutMs);
			return this.handleResponse<T>(res);
		} finally {
			cleanup();
		}
	}

	private async handleResponse<T>(res: Response): Promise<T> {
		captureCsrfToken(res);

		if (res.ok) {
			if (res.status === 204) {
				return undefined as T;
			}
			return (await res.json()) as T;
		}

		let message = 'An unexpected error occurred';
		let code: ErrorCode | undefined;
		let requestId: string | undefined;
		let details: Record<string, unknown> | undefined;

		try {
			const body = (await res.json()) as ErrorResponse;
			message = body.message ?? body.error ?? message;
			code = body.code;
			requestId = body.requestId;
			details = body.details;
		} catch {
			// Response body wasn't JSON
		}

		// Global error toasting happens once per failure (after retries) in the
		// QueryCache/MutationCache onError handlers — see lib/queryClient.ts.
		throw new ApiError(message, res.status, code, requestId, details);
	}
}

const apiClient = new ApiClient();

export { ApiError, apiClient };
