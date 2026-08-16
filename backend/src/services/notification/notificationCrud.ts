import { and, count, eq, isNull, or, sql } from 'drizzle-orm';

import type { NotificationType } from './notificationBroadcastService.ts';

import { getDb } from '../../db/index.ts';
import { notifications } from '../../db/schema/notifications.ts';
import { paginatedQuery } from '../../utils/dbHelpers.ts';
import { resolveSort } from '../../utils/sorting.ts';
import { broadcastToUser } from '../websocketService.ts';

type Notification = typeof notifications.$inferSelect;

/**
 * Columns /notifications may be sorted by, keyed as its table's own column ids so a clickable
 * header and an orderable column are the same list. `message` is deliberately absent: it is the
 * long free-text column, and ordering a list of alerts alphabetically by their body is not an
 * order anyone reads for.
 */
const NOTIFICATION_SORT_COLUMNS = {
	createdAt: notifications.createdAt,
	readAt: notifications.readAt,
	title: notifications.title,
	type: notifications.type,
};

interface ListOptions {
	limit: number;
	page: number;
	readStatus?: 'all' | 'read' | 'unread';
	/** A key of NOTIFICATION_SORT_COLUMNS; anything else falls back to newest first. */
	sortBy?: string;
	/** `asc`, or descending for anything else. */
	sortDir?: string;
	type?: NotificationType;
	userId: number;
	workspaceId?: null | number;
}

interface CreateInput {
	createdBy?: number;
	message: string;
	metadata?: null | Record<string, unknown>;
	title: string;
	type: NotificationType;
	userId: number;
	workspaceId?: number;
}

/**
 * List notifications for a user with pagination and filtering.
 *
 * @param options - List options including userId, pagination, and filters
 * @returns Paginated notification list with total count
 */
function list(options: ListOptions): {
	data: Notification[];
	limit: number;
	page: number;
	total: number;
} {
	const db = getDb();

	const conditions = [
		eq(notifications.userId, options.userId),
		eq(notifications.isDeleted, false),
	];

	if (options.workspaceId !== undefined && options.workspaceId !== null) {
		conditions.push(
			or(
				eq(notifications.workspaceId, options.workspaceId),
				isNull(notifications.workspaceId),
			)!,
		);
	}

	if (options.type) {
		conditions.push(eq(notifications.type, options.type));
	}

	if (options.readStatus === 'read') {
		conditions.push(sql`${notifications.readAt} IS NOT NULL`);
	} else if (options.readStatus === 'unread') {
		conditions.push(sql`${notifications.readAt} IS NULL`);
	}

	const where = and(...conditions);

	return paginatedQuery(
		options.page,
		options.limit,
		(limitNum, offset) =>
			db
				.select()
				.from(notifications)
				.where(where)
				// `id` as the tiebreaker, returned with the sort — see auditService for why an
				// unresolved tie under LIMIT/OFFSET can show one row twice and another not at all.
				.orderBy(
					...resolveSort(
						NOTIFICATION_SORT_COLUMNS,
						notifications.createdAt,
						options.sortBy,
						options.sortDir,
						notifications.id,
					),
				)
				.limit(limitNum)
				.offset(offset)
				.all(),
		() => db.select({ count: count() }).from(notifications).where(where).get(),
	);
}

/**
 * Get a single notification by ID.
 *
 * @param id - Notification ID
 * @param userId - Owner user ID for access check
 * @returns Notification or null
 */
function getById(id: number, userId: number): Notification | null {
	const db = getDb();
	return (
		db
			.select()
			.from(notifications)
			.where(
				and(
					eq(notifications.id, id),
					eq(notifications.userId, userId),
					eq(notifications.isDeleted, false),
				),
			)
			.get() ?? null
	);
}

/**
 * Create a new notification.
 *
 * @param input - Notification data
 * @returns Created notification
 */
function create(input: CreateInput): Notification {
	const db = getDb();
	const result = db
		.insert(notifications)
		.values({
			...(input.createdBy ? { createdBy: input.createdBy } : {}),
			...(input.metadata ? { metadata: input.metadata } : {}),
			message: input.message,
			title: input.title,
			type: input.type ?? 'info',
			userId: input.userId,
			workspaceId: input.workspaceId ?? null,
		})
		.returning()
		.get();

	broadcastToUser(input.userId, {
		data: {
			id: result.id,
			message: result.message,
			title: result.title,
			type: result.type,
		},
		type: 'notification',
	});

	return result;
}

export { create, getById, list };
