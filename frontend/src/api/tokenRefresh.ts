import { toast } from 'sonner';

import { WebSocketManager } from '@/lib/websocket/manager';
import { useAuthStore } from '@/stores/authStore';

import { getCsrfHeader, getCommonHeaders } from './requestHelpers';
import { DEFAULT_API_TIMEOUT_MS, fetchWithRetry, withTimeout } from './retryHandler';

let refreshPromise: null | Promise<boolean> = null;
let isLoggingOut = false;

/** Reset the logging-out guard. Call when the user explicitly logs in. */
function resetLoggingOutGuard(): void {
	isLoggingOut = false;
}

/** Attempt to refresh the access token, retrying once on 409 (concurrent rotation). */
async function attemptRefresh(): Promise<boolean> {
	const headers: Record<string, string> = getCommonHeaders();

	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch('/api/v1/auth/refresh', {
			credentials: 'include',
			headers: { ...headers, ...getCsrfHeader() },
			method: 'POST',
		});

		if (res.ok) {
			const csrfToken = res.headers.get('X-CSRF-Token');
			if (csrfToken) {
				useAuthStore.getState().setCsrfToken(csrfToken);
			}
			return true;
		}

		// 409 = concurrent refresh from another tab rotated the token.
		// Retry once — the new cookie from that tab's response may already be set.
		if (res.status === 409 && attempt === 0) continue;

		return false;
	}

	return false;
}

/** Deduplicate concurrent refresh calls so only one in-flight request exists. */
function deduplicateRefresh(): Promise<boolean> {
	if (!refreshPromise) {
		refreshPromise = attemptRefresh().finally(() => {
			refreshPromise = null;
		});
	}

	return refreshPromise;
}

/** Retry a request with fresh CSRF headers after a successful token refresh. */
async function retryWithFreshToken(url: string, options: RequestInit): Promise<Response> {
	const existingHeaders = (options.headers ?? {}) as Record<string, string>;
	const freshHeaders = { ...existingHeaders, ...getCsrfHeader() };
	const { cleanup, signal } = withTimeout(DEFAULT_API_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			...options,
			headers: freshHeaders,
			signal,
		});
		// Capture rotated CSRF token from the retry response so subsequent POSTs
		// don't carry a stale token. Without this, any 401→refresh→retry sequence
		// silently drops the new token issued by the backend on the retried request.
		const csrfToken = res.headers.get('X-CSRF-Token');
		if (csrfToken) {
			useAuthStore.getState().setCsrfToken(csrfToken);
		}
		return res;
	} finally {
		cleanup();
	}
}

/**
 * Handle session expiry by logging out and redirecting to login.
 *
 * Distinguishes between:
 * - Genuine session expiry (user was authenticated, token refresh failed)
 *   → redirect to /login?expired=1 so the login page can show "your session expired"
 * - Cold-start anonymous 401 (user never had a session, initial /auth/me returned 401)
 *   → redirect to plain /login with no query params
 */
function handleSessionExpired(): void {
	if (!isLoggingOut) {
		isLoggingOut = true;
		WebSocketManager.getInstance().disconnect();
		const hadSession = useAuthStore.getState().isAuthenticated;
		useAuthStore.getState().logout();
		window.location.href = hadSession ? '/login?expired=1' : '/login';
	}
}

/**
 * Fetch with automatic 401 handling: captures CSRF tokens, attempts token refresh
 * on 401 responses, and handles session expiry.
 */
async function fetchWithRefresh(
	url: string,
	init: RequestInit,
	shouldRetry = false,
	timeoutMs = DEFAULT_API_TIMEOUT_MS
): Promise<Response> {
	const options: RequestInit = { ...init, credentials: 'include' };

	let res: Response;
	try {
		res = await fetchWithRetry(url, options, shouldRetry, timeoutMs);
	} catch (err) {
		if (err instanceof TypeError) {
			toast.error('Network error - check your connection');
		}
		throw err;
	}

	// Capture CSRF token from any response that provides one
	const csrfToken = res.headers.get('X-CSRF-Token');
	if (csrfToken) {
		useAuthStore.getState().setCsrfToken(csrfToken);
	}

	if (res.status !== 401) return res;
	if (url.includes('/api/v1/auth/refresh') || url.includes('/api/v1/auth/login')) return res;

	const refreshed = await deduplicateRefresh();
	if (refreshed) return retryWithFreshToken(url, options);

	handleSessionExpired();
	return res;
}

export { fetchWithRefresh, resetLoggingOutGuard };
