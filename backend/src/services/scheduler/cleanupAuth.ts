import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import { MAX_CLEANUP_BATCH_SIZE, STALE_USER_LOGIN_DAYS } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { notifications } from '../../db/schema/notifications.ts';
import { users } from '../../db/schema/users.ts';
import { cleanupExpiredBlacklistEntries } from '../../utils/auth/tokenBlacklist.ts';
import { logScheduler } from '../../utils/logger.ts';
import { log as logAudit } from '../auditService.ts';
import { cleanupExpiredPKCECodes } from '../oauth/oauthProviderService.ts';
import {
	createBatchCleanupTask,
	cutoffDate,
	daysAgo,
	MAX_CLEANUP_BATCHES,
	type DbClient,
} from './cleanupUtils.ts';

function batchTokenUpdate(
	db: DbClient,
	condition: ReturnType<typeof and>,
	updates: Record<string, unknown>,
	now: Date
): number {
	const idsToUpdate = db
		.select({ id: users.id })
		.from(users)
		.where(condition)
		.limit(MAX_CLEANUP_BATCH_SIZE)
		.all()
		.map((row) => row.id);

	if (idsToUpdate.length === 0) return 0;

	db.update(users)
		.set({ ...updates, updatedAt: now })
		.where(sql`${users.id} IN ${idsToUpdate}`)
		.run();

	return idsToUpdate.length;
}

function tokenCleanupTask(): { refreshTokensCleaned: number; resetTokensCleaned: number } {
	const db = getDb();
	const now = new Date();

	const resetCondition = and(isNotNull(users.resetToken), lt(users.resetTokenExpiresAt, now));
	let resetTokensCleaned = 0;
	let batches = 0;
	let batchCleaned = batchTokenUpdate(
		db,
		resetCondition,
		{ resetToken: null, resetTokenExpiresAt: null },
		now
	);
	while (batchCleaned > 0 && batches < MAX_CLEANUP_BATCHES) {
		resetTokensCleaned += batchCleaned;
		batches++;
		batchCleaned = batchTokenUpdate(
			db,
			resetCondition,
			{ resetToken: null, resetTokenExpiresAt: null },
			now
		);
	}

	if (batches >= MAX_CLEANUP_BATCHES) {
		logScheduler('warn', 'Reset token cleanup hit batch cap, remaining work deferred', {
			batches,
			resetTokensCleaned,
		});
	}

	const staleDate = daysAgo(STALE_USER_LOGIN_DAYS);
	const refreshCondition = and(
		isNotNull(users.refreshTokenHash),
		lt(users.lastLoginAt, staleDate)
	);
	let refreshTokensCleaned = 0;
	batches = 0;
	batchCleaned = batchTokenUpdate(db, refreshCondition, { refreshTokenHash: null }, now);
	while (batchCleaned > 0 && batches < MAX_CLEANUP_BATCHES) {
		refreshTokensCleaned += batchCleaned;
		batches++;
		batchCleaned = batchTokenUpdate(db, refreshCondition, { refreshTokenHash: null }, now);
	}

	if (batches >= MAX_CLEANUP_BATCHES) {
		logScheduler('warn', 'Refresh token cleanup hit batch cap, remaining work deferred', {
			batches,
			refreshTokensCleaned,
		});
	}

	const blacklistResult = cleanupExpiredBlacklistEntries();

	// Clean up expired PKCE code verifiers (OAuth flow state)
	cleanupExpiredPKCECodes();

	logScheduler('info', 'Token cleanup task completed', {
		blacklistBatches: blacklistResult.batches,
		blacklistCleaned: blacklistResult.cleaned,
		refreshTokensCleaned,
		resetTokensCleaned,
	});

	// Audit log for token purge (system-initiated, no userId)
	if (resetTokensCleaned > 0 || refreshTokensCleaned > 0 || blacklistResult.cleaned > 0) {
		logAudit({
			action: 'SYSTEM_CLEANUP token_purge',
			details: {
				blacklistCleaned: blacklistResult.cleaned,
				refreshTokensCleaned,
				resetTokensCleaned,
			},
			entityType: 'users',
		});
	}

	return { refreshTokensCleaned, resetTokensCleaned };
}

function notificationsCleanupTask(): {
	batches: number;
	cleaned: number;
} {
	const config = getConfig();
	return createBatchCleanupTask({
		deleteBatch: (db, now) => {
			const cutoff = cutoffDate(now, config.retention.notificationsDays);
			const idsToDelete = db
				.select({ id: notifications.id })
				.from(notifications)
				.where(and(eq(notifications.isDeleted, true), lt(notifications.deletedAt, cutoff)))
				.limit(MAX_CLEANUP_BATCH_SIZE)
				.all()
				.map((row) => row.id);

			if (idsToDelete.length === 0) return 0;

			db.delete(notifications)
				.where(sql`${notifications.id} IN ${idsToDelete}`)
				.run();

			return idsToDelete.length;
		},
		taskName: 'Notifications cleanup task',
	})();
}

export { notificationsCleanupTask, tokenCleanupTask };
