import { useQuery } from '@tanstack/react-query';

import type { Notification, PaginatedResponse } from '@/api/types';

import { ApiError } from '@/api/apiError';
import {
	getUnreadCount,
	listNotifications,
	notificationKeys,
	RECENT_NOTIFICATIONS_LIMIT,
} from '@/api/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Retry strategy for header notification queries.
 *
 * Auth errors (401/403) are already handled transparently by fetchWithRefresh
 * (token refresh + automatic retry). If an auth error still reaches TanStack Query
 * it means the session is truly expired and the user is being redirected to login —
 * retrying would only produce wasted requests. All other transient errors (5xx,
 * network) get one retry so the bell recovers without a full page reload.
 */
function retryNotificationQuery(failureCount: number, error: Error): boolean {
	if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
		return false;
	}
	return failureCount < 1;
}

/**
 * Hook for header notification state.
 * Notification cache updates are handled by useNotificationSocket (single source of truth).
 * This hook only reads from the TanStack Query cache.
 */
export function useHeader() {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const isSessionVerified = useAuthStore((s) => s.isSessionVerified);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const canLoadNotifications = isAuthenticated && isSessionVerified && activeWorkspaceId !== null;

	// Initial fetch only (no polling) — WebSocket handles real-time updates.
	// Uses a targeted retry that skips auth errors (handled by fetchWithRefresh)
	// but retries transient failures so the bell recovers from 5xx/network blips.
	const { data: unreadData } = useQuery({
		enabled: canLoadNotifications,
		queryFn: getUnreadCount,
		queryKey: notificationKeys.unreadCount(activeWorkspaceId),
		retry: retryNotificationQuery,
		staleTime: Infinity, // Data is updated via WebSocket, not refetching
		throwOnError: false,
	});

	const { data: recentData } = useQuery<PaginatedResponse<Notification>>({
		enabled: canLoadNotifications,
		queryFn: () => listNotifications({ limit: String(RECENT_NOTIFICATIONS_LIMIT), page: '1' }),
		queryKey: notificationKeys.recent(activeWorkspaceId),
		retry: retryNotificationQuery,
		staleTime: Infinity, // Data is updated via WebSocket, not refetching
		throwOnError: false,
	});

	return {
		recentNotifications: recentData,
		unreadCount: unreadData?.data.count ?? 0,
	};
}
