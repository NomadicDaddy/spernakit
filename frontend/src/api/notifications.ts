import type {
	DataResponse,
	Notification,
	NotificationStatistics,
	PaginatedResponse,
	SuccessResponse,
} from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

/** Maximum recent notifications shown in header dropdown and socket cache. */
export const RECENT_NOTIFICATIONS_LIMIT = 5;

/** Query key constants for notification-related queries (workspace-scoped). */
export const notificationKeys = {
	list: (
		workspaceId: null | number,
		params?: { limit?: string; page?: string; readStatus?: string; type?: string }
	) =>
		[
			'notifications',
			workspaceId,
			params?.page ?? '1',
			params?.limit ?? '20',
			params?.readStatus ?? 'all',
			params?.type ?? 'all',
		] as const,
	recent: (workspaceId: null | number) => ['notifications', 'recent', workspaceId] as const,
	statistics: (workspaceId: null | number) => ['notification-statistics', workspaceId] as const,
	unreadCount: (workspaceId: null | number) => ['unread-count', workspaceId] as const,
};

/** Query parameters for filtering the notification list. */
interface ListNotificationsParams {
	limit?: string;
	page?: string;
	readStatus?: 'all' | 'read' | 'unread';
	type?: string;
}

/** Fetch paginated notifications with optional filtering by read status and type. */
function listNotifications(
	params?: ListNotificationsParams
): Promise<PaginatedResponse<Notification>> {
	const filtered = buildQueryParams(params);
	return apiClient.get<PaginatedResponse<Notification>>('/notifications', {
		...(filtered ? { params: filtered } : {}),
	});
}

/** Fetch aggregate notification statistics (total, unread, counts by type). */
function getNotificationStatistics(): Promise<DataResponse<NotificationStatistics>> {
	return apiClient.get<DataResponse<NotificationStatistics>>('/notifications/statistics');
}

/** Fetch the total count of unread notifications for the current user. */
function getUnreadCount(): Promise<DataResponse<{ count: number }>> {
	return apiClient.get<DataResponse<{ count: number }>>('/notifications/unread-count');
}

/** Mark a single notification as read by its ID. */
function markNotificationAsRead(id: number): Promise<SuccessResponse> {
	return apiClient.put<SuccessResponse>(`/notifications/${id}/read`);
}

/** Mark all of the current user's notifications as read. */
function markAllNotificationsAsRead(): Promise<DataResponse<{ count: number }>> {
	return apiClient.put<DataResponse<{ count: number }>>('/notifications/read-all');
}

/** Soft-delete a single notification. */
function deleteNotification(id: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/notifications/${id}`);
}

/** Soft-delete multiple notifications by their IDs. */
function bulkDeleteNotifications(ids: number[]): Promise<DataResponse<{ count: number }>> {
	return apiClient.post<DataResponse<{ count: number }>>('/notifications/bulk-delete', {
		body: { ids },
	});
}

/** Payload for broadcasting a notification to all (or filtered) users. */
interface BroadcastNotificationData {
	message: string;
	roleFilter?: string;
	title: string;
	type?: string;
}

/** Broadcast a notification to all users (ADMIN+). Optionally filter by role. */
function broadcastNotification(
	data: BroadcastNotificationData
): Promise<DataResponse<{ count: number }>> {
	return apiClient.post<DataResponse<{ count: number }>>('/notifications/broadcast', {
		body: data,
	});
}

/** Effective notification retention policy read live from server config. */
interface NotificationRetentionPolicy {
	deletedNotificationsDays: number;
}

/** Fetch the effective notification retention policy (ADMIN+). */
function getNotificationRetentionPolicy(): Promise<DataResponse<NotificationRetentionPolicy>> {
	return apiClient.get<DataResponse<NotificationRetentionPolicy>>(
		'/notifications/retention-policy'
	);
}

/** Per-user notification channel preferences (email, push, alerts). */
interface NotificationPreferences {
	emailNotifications: boolean;
	marketingEmails: boolean;
	pushNotifications: boolean;
	securityAlerts: boolean;
	systemAlerts: boolean;
}

/** Fetch the current user's notification preferences. */
function getNotificationPreferences(): Promise<DataResponse<NotificationPreferences>> {
	return apiClient.get<DataResponse<NotificationPreferences>>('/notifications/preferences');
}

/** Update the current user's notification preferences. */
function updateNotificationPreferences(
	preferences: NotificationPreferences
): Promise<DataResponse<NotificationPreferences>> {
	return apiClient.put<DataResponse<NotificationPreferences>>('/notifications/preferences', {
		body: preferences,
	});
}

export {
	broadcastNotification,
	bulkDeleteNotifications,
	deleteNotification,
	getNotificationPreferences,
	getNotificationRetentionPolicy,
	getNotificationStatistics,
	getUnreadCount,
	listNotifications,
	markAllNotificationsAsRead,
	markNotificationAsRead,
	updateNotificationPreferences,
};
export type { BroadcastNotificationData, NotificationPreferences, NotificationRetentionPolicy };
