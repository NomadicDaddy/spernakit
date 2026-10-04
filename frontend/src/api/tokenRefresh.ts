import { lazyToast } from '@/lib/lazyToast';
import { WebSocketManager } from '@/lib/websocket/manager';
import { isAnonymousPath } from '@/routes/publicPaths';
import { useAuthStore } from '@/stores/authStore';

import { getCommonHeaders, getCsrfHeader } from './requestHelpers';
import { DEFAULT_API_TIMEOUT_MS, fetchWithRetry, withTimeout } from './retryHandler';

let refreshPromise: null | Promise<boolean> = null;
let isLoggingOut = false;

/** Reset the logging-out guard. Call when the user explicitly logs in. */
function resetLoggingOutGuard(): void {
	isLoggingOut = false;
}

/** Name of the lock every tab of this origin takes before it refreshes. */
const REFRESH_LOCK_NAME = 'auth-refresh';

/** Ask the server to rotate the token pair. */
async function attemptRefresh(): Promise<boolean> {
	const res = await fetch('/api/v1/auth/refresh', {
		credentials: 'include',
		headers: { ...getCommonHeaders(), ...getCsrfHeader() },
		method: 'POST',
	});
	if (!res.ok) return false;

	const csrfToken = res.headers.get('X-CSRF-Token');
	if (csrfToken) {
		useAuthStore.getState().setCsrfToken(csrfToken);
	}
	return true;
}

/**
 * Refresh under a lock shared by every tab of this origin.
 *
 * Tabs share the refresh cookie, and the server treats a second presentation of an already
 * rotated token as theft and ends the sign-in. Holding the lock means a tab that waits sends the
 * cookie the previous tab's refresh just set, never the one it rotated away. Without the Locks API
 * (an insecure context: a plain-HTTP host other than localhost, which production's required HTTPS
 * rules out) the refresh runs unguarded, and two tabs refreshing at once can end the sign-in.
 */
function refreshAcrossTabs(): Promise<boolean> {
	const locks = (navigator as Partial<Navigator>).locks;
	if (!locks) return attemptRefresh();
	return locks.request(REFRESH_LOCK_NAME, attemptRefresh);
}

/** Deduplicate concurrent refresh calls so only one in-flight request exists per tab. */
function deduplicateRefresh(): Promise<boolean> {
	if (!refreshPromise) {
		refreshPromise = refreshAcrossTabs().finally(() => {
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
 *
 * Routes that render without a session are exempt: a 401 there is the expected answer to an
 * authenticated-only request, not an expiry. Without this guard a single ungated ambient query
 * evicts an anonymous visitor from a public page — which is what a stray `getUserUiSettings()`
 * did to every shared-dashboard link.
 */
function handleSessionExpired(): void {
	if (isAnonymousPath(window.location.pathname)) return;

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
	timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
	const options: RequestInit = { ...init, credentials: 'include' };

	let res: Response;
	try {
		res = await fetchWithRetry(url, options, shouldRetry, timeoutMs);
	} catch (err) {
		if (err instanceof TypeError) {
			lazyToast.error('Network error - check your connection');
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
