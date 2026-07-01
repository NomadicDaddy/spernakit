import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { generateRequestId, getSessionId } from '@/utils/correlationId';

/**
 * Get active workspace ID from Zustand store.
 * Uses store.getState() directly for fast in-memory access.
 */
function getWorkspaceId(): null | number {
	return useWorkspaceStore.getState().activeWorkspaceId;
}

/**
 * Get common headers for all API requests.
 */
export function getCommonHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-Request-ID': generateRequestId(),
		'X-Session-ID': getSessionId(),
	};

	const workspaceId = getWorkspaceId();
	if (workspaceId !== null) {
		headers['X-Workspace-ID'] = String(workspaceId);
	}

	return headers;
}

/**
 * Get CSRF token header for state-changing requests.
 */
export function getCsrfHeader(): Record<string, string> | undefined {
	const { csrfToken } = useAuthStore.getState();
	if (csrfToken) {
		return { 'X-CSRF-Token': csrfToken };
	}
	return undefined;
}

/**
 * Filter optional params into a Record<string, string>, excluding undefined values.
 * Returns undefined if no valid params remain (avoids sending empty query strings).
 * Accepts string, number, and boolean values — non-string values are converted via String().
 */
export function buildQueryParams<
	T extends { [K in keyof T]: boolean | number | string | undefined },
>(params?: T): Record<string, string> | undefined {
	if (!params) return undefined;
	const entries: [string, string][] = [];
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === 'string') {
			entries.push([key, value]);
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			entries.push([key, String(value)]);
		}
	}
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
