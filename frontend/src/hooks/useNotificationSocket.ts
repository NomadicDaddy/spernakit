import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { DataResponse, Notification, NotificationType, PaginatedResponse } from '@/api/types';
import type { WsMessageHandler } from '@/stores/wsStore';

import { notificationKeys, RECENT_NOTIFICATIONS_LIMIT } from '@/api/notifications';
import { lazyToast } from '@/lib/lazyToast';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWsStore } from '@/stores/wsStore';

interface NotificationData {
	id: number;
	message: string;
	title: string;
	type: string;
}

/** Message type the backend uses for a delivered notification on the user channel. */
const NOTIFICATION_MESSAGE_TYPE = 'notification';

/**
 * Narrow a user-channel message to a delivered notification. The same channel also carries
 * user-scoped CRUD events (dashboards, files) and the subscribe acknowledgement, which must not
 * reach the unread count or the recent list.
 *
 * @param message - Raw message from the WebSocket dispatcher
 * @returns The notification payload, or null when the message is anything else
 */
function toNotificationData(message: unknown): NotificationData | null {
	if (typeof message !== 'object' || message === null) return null;
	if (!('type' in message) || message.type !== NOTIFICATION_MESSAGE_TYPE) return null;
	if (!('data' in message) || typeof message.data !== 'object' || message.data === null) {
		return null;
	}
	const { data } = message;
	if (
		!('id' in data) ||
		typeof data.id !== 'number' ||
		!('message' in data) ||
		typeof data.message !== 'string' ||
		!('title' in data) ||
		typeof data.title !== 'string' ||
		!('type' in data) ||
		typeof data.type !== 'string'
	) {
		return null;
	}
	return { id: data.id, message: data.message, title: data.title, type: data.type };
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

		const handler: WsMessageHandler = (message) => {
			const notification = toNotificationData(message);
			if (!notification) return;

			// Optimistically increment unread count
			queryClient.setQueryData<DataResponse<{ count: number }>>(
				notificationKeys.unreadCount(activeWorkspaceId),
				(oldData) => ({
					data: { count: (oldData?.data?.count ?? 0) + 1 },
				}),
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
							RECENT_NOTIFICATIONS_LIMIT,
						),
						total: oldData.total + 1,
					};
				},
			);

			// Invalidate statistics for pages that display them
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.statistics(activeWorkspaceId),
			});

			// Show a toast for the new notification
			lazyToast(notification.title, {
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
