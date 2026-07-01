import type { NotificationType } from 'spernakit-shared';

import { and, count, eq, isNull, or, sql } from 'drizzle-orm';

import type { UserRole } from '../../types/roles.ts';

import { getDb } from '../../db/index.ts';
import { notifications } from '../../db/schema/notifications.ts';
import { users } from '../../db/schema/users.ts';
import { isDefined } from '../../utils/dbHelpers.ts';
import { logger } from '../../utils/logger.ts';
import { broadcastToUser } from '../websocketService.ts';

const MAX_BROADCAST_BATCH_SIZE = 100;

interface BroadcastInput {
	createdBy?: number;
	message: string;
	roleFilter?: UserRole;
	title: string;
	type: NotificationType;
}

/**
 * Broadcast a notification to all users, optionally filtered by role.
 * Processes users in batches to avoid unbounded memory usage.
 *
 * @param input - Broadcast data
 * @returns Number of notifications created
 */
function broadcast(input: BroadcastInput): number {
	const db = getDb();

	const userConditions = [eq(users.isDeleted, false)];
	if (input.roleFilter) {
		userConditions.push(eq(users.role, input.roleFilter));
	}

	const where = and(...userConditions);

	// Count first to know total without loading all IDs
	const totalUsers = db.select({ count: count() }).from(users).where(where).get()?.count ?? 0;

	if (totalUsers === 0) return 0;

	if (totalUsers > MAX_BROADCAST_BATCH_SIZE) {
		logger.info(
			{ batchSize: MAX_BROADCAST_BATCH_SIZE, totalUsers },
			'Notification broadcast processing in batches'
		);
	}

	let created = 0;

	for (let offset = 0; offset < totalUsers; offset += MAX_BROADCAST_BATCH_SIZE) {
		const batch = db
			.select({ id: users.id })
			.from(users)
			.where(where)
			.limit(MAX_BROADCAST_BATCH_SIZE)
			.offset(offset)
			.all();

		const rows = batch.map((u) => ({
			...(input.createdBy ? { createdBy: input.createdBy } : {}),
			message: input.message,
			title: input.title,
			type: input.type ?? ('info' as const),
			userId: u.id,
		}));

		const results = db.insert(notifications).values(rows).returning().all();

		for (const result of results) {
			broadcastToUser(result.userId, {
				data: {
					id: result.id,
					message: result.message,
					title: result.title,
					type: result.type,
				},
				type: 'notification',
			});
		}

		created += results.length;
	}

	return created;
}

/**
 * Get notification statistics for a user.
 * Uses a single query with conditional aggregation for efficiency.
 *
 * @param userId - User ID
 * @param workspaceId - Optional workspace ID to filter by
 * @returns Statistics with total, read, unread counts and breakdown by type
 */
function getStatistics(
	userId: number,
	workspaceId?: null | number
): { byType: Record<string, number>; read: number; total: number; unread: number } {
	const db = getDb();
	const baseConditions = [eq(notifications.userId, userId), eq(notifications.isDeleted, false)];
	if (isDefined(workspaceId)) {
		baseConditions.push(
			or(eq(notifications.workspaceId, workspaceId), isNull(notifications.workspaceId))!
		);
	}
	const base = and(...baseConditions);

	const rows = db
		.select({
			readCount: sql<number>`COUNT(CASE WHEN ${notifications.readAt} IS NOT NULL THEN 1 END)`,
			totalCount: count(),
			type: notifications.type,
		})
		.from(notifications)
		.where(base)
		.groupBy(notifications.type)
		.all();

	let total = 0;
	let read = 0;
	const byType: Record<string, number> = {};

	for (const row of rows) {
		total += row.totalCount;
		read += row.readCount;
		byType[row.type] = row.totalCount;
	}

	return { byType, read, total, unread: total - read };
}

export { broadcast, getStatistics };
export type { BroadcastInput, NotificationType };
