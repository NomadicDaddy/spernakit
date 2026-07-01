import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { notifications } from '../../db/schema/notifications.ts';
import { logDatabase } from '../../utils/logger.ts';

const MARK_ALL_BATCH_SIZE = 500;
const MARK_ALL_MAX_BATCHES = 100;

/**
 * Find a non-deleted notification owned by the given user.
 * @param id
 * @param userId
 * @param extraConditions
 * @returns Notification stub or undefined if not found
 */
function findOwned(
	id: number,
	userId: number,
	extraConditions?: ReturnType<typeof eq>
): { id: number } | undefined {
	const db = getDb();
	return db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.id, id),
				eq(notifications.userId, userId),
				eq(notifications.isDeleted, false),
				extraConditions
			)
		)
		.get();
}

/**
 * Mark a notification as read.
 *
 * @param id - Notification ID
 * @param userId - Owner user ID
 * @returns True if updated
 */
function markAsRead(id: number, userId: number): boolean {
	const existing = findOwned(id, userId, isNull(notifications.readAt));
	if (!existing) return false;

	const db = getDb();
	db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id)).run();

	return true;
}

/**
 * Mark all notifications as read for a user, optionally scoped to a workspace.
 *
 * When workspaceId is provided, only notifications whose workspaceId matches
 * (or is null/unscoped) are marked read. When workspaceId is omitted, all of
 * the user's notifications across every workspace are marked read (used by
 * SYSOP).
 *
 * @param userId - User ID
 * @param workspaceId - Optional workspace scope
 * @returns Number of notifications marked as read
 */
function markAllAsRead(userId: number, workspaceId?: null | number): number {
	const db = getDb();
	const markedAt = new Date();
	const conditions = [
		eq(notifications.userId, userId),
		eq(notifications.isDeleted, false),
		isNull(notifications.readAt),
	];

	if (workspaceId !== undefined && workspaceId !== null) {
		conditions.push(
			or(eq(notifications.workspaceId, workspaceId), isNull(notifications.workspaceId))!
		);
	}

	const where = and(...conditions);
	let totalMarked = 0;
	let batches = 0;

	while (batches < MARK_ALL_MAX_BATCHES) {
		const idsToMark = db
			.select({ id: notifications.id })
			.from(notifications)
			.where(where)
			.limit(MARK_ALL_BATCH_SIZE)
			.all()
			.map((row) => row.id);

		if (idsToMark.length === 0) break;

		db.update(notifications)
			.set({ readAt: markedAt })
			.where(inArray(notifications.id, idsToMark))
			.run();

		totalMarked += idsToMark.length;
		batches++;

		if (idsToMark.length < MARK_ALL_BATCH_SIZE) break;
	}

	if (batches >= MARK_ALL_MAX_BATCHES) {
		logDatabase('warn', 'markAllAsRead hit batch cap, remaining work deferred', {
			batches,
			marked: totalMarked,
			userId,
			workspaceId: workspaceId ?? null,
		});
	}

	return totalMarked;
}

/**
 * Soft delete a single notification.
 *
 * @param id - Notification ID
 * @param userId - Owner user ID
 * @returns True if deleted
 */
function deleteOne(id: number, userId: number): boolean {
	const existing = findOwned(id, userId);
	if (!existing) return false;

	const db = getDb();
	db.update(notifications)
		.set({
			deletedAt: new Date(),
			deletedBy: userId,
			isDeleted: true,
		})
		.where(eq(notifications.id, id))
		.run();

	return true;
}

/**
 * Bulk soft delete notifications.
 *
 * @param ids - Notification IDs
 * @param userId - Owner user ID
 * @returns Number of deleted notifications
 */
function bulkDelete(ids: number[], userId: number): number {
	if (ids.length === 0) return 0;
	const db = getDb();
	const deleted = db
		.update(notifications)
		.set({
			deletedAt: new Date(),
			deletedBy: userId,
			isDeleted: true,
		})
		.where(
			and(
				inArray(notifications.id, ids),
				eq(notifications.userId, userId),
				eq(notifications.isDeleted, false)
			)
		)
		.returning({ id: notifications.id })
		.all();

	return deleted.length;
}

export { bulkDelete, deleteOne, markAllAsRead, markAsRead };
