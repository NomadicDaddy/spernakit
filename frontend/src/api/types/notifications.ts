import type { NotificationType } from 'spernakit-shared';

/** Notification */
interface Notification {
	createdAt: string;
	id: number;
	message: string;
	readAt: null | string;
	title: string;
	type: NotificationType;
	userId: number;
}

/** Aggregate notification counts returned by the statistics endpoint. */
interface NotificationStatistics {
	byType: Record<NotificationType, number>;
	total: number;
	unread: number;
}

export type { Notification, NotificationStatistics, NotificationType };
