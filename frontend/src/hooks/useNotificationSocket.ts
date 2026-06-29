import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { DataResponse, Notification, NotificationType, PaginatedResponse } from '@/api/types';
import type { WsMessageHandler } from '@/stores/wsStore';

import { notificationKeys, RECENT_NOTIFICATIONS_LIMIT } from '@/api/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWsStore } from '@/stores/wsStore';

interface NotificationData {
	id: number;
	message: string;
	title: string;
	type: string;
}

/**
 * Listens for real-time notification messages on the user's WebSocket channel.
 * Handles optimistic cache updates (unread count, recent list), statistics
 * invalidation, and toast display.
 *
 * Should be called once in AppShell so it runs globally when authenticated.
 */
function useNotificationSocket(): void {
	const queryClient = useQueryClient();
	const userId = useAuthStore((s) => s.user?.id ?? null);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const subscribe = useWsStore((s) => s.subscribe);
	const unsubscribe = useWsStore((s) => s.unsubscribe);
	const connectionState = useWsStore((s) => s.connectionState);

	// Handle incoming notifications: optimistic cache update + toast
	useEffect(() => {
		if (!userId || connectionState !== 'connected') return;

		const channel = `user:${userId}`;

		const handler: WsMessageHandler = (data) => {
			const notification = data as NotificationData;

			// Optimistically increment unread count
			queryClient.setQueryData<DataResponse<{ count: number }>>(
				notificationKeys.unreadCount(activeWorkspaceId),
				(oldData) => ({
					data: { count: (oldData?.data?.count ?? 0) + 1 },
				})
			);

			// Add new notification to recent list
			queryClient.setQueryData<PaginatedResponse<Notification>>(
				notificationKeys.recent(activeWorkspaceId),
				(oldData) => {
					const newNotification: Notification = {
						createdAt: new Date().toISOString(),
						id: notification.id,
						message: notification.message,
						readAt: null,
						title: notification.title,
						type: notification.type as NotificationType,
						userId,
					};
					if (!oldData) {
						return {
							data: [newNotification],
							limit: RECENT_NOTIFICATIONS_LIMIT,
							page: 1,
							total: 1,
						};
					}
					return {
						...oldData,
						data: [newNotification, ...oldData.data].slice(
							0,
							RECENT_NOTIFICATIONS_LIMIT
						),
						total: oldData.total + 1,
					};
				}
			);

			// Invalidate statistics for pages that display them
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.statistics(activeWorkspaceId),
			});

			// Show a toast for the new notification
			toast(notification.title, {
				description: notification.message,
			});
		};

		subscribe(channel, handler);

		return () => {
			unsubscribe(channel, handler);
		};
	}, [userId, activeWorkspaceId, connectionState, subscribe, unsubscribe, queryClient]);

	// Refetch notification data when WebSocket reconnects (throttled to prevent 429 cascade)
	const lastInvalidatedRef = useRef(0);
	useEffect(() => {
		if (connectionState === 'connected' && isAuthenticated) {
			const now = Date.now();
			if (now - lastInvalidatedRef.current < 30_000) return;
			lastInvalidatedRef.current = now;

			void queryClient.invalidateQueries({
				queryKey: notificationKeys.recent(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.unreadCount(activeWorkspaceId),
			});
		}
	}, [activeWorkspaceId, connectionState, isAuthenticated, queryClient]);
}

export { useNotificationSocket };
