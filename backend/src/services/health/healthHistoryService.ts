import { and, desc, isNull, lt, sql } from 'drizzle-orm';

import { MAX_CLEANUP_BATCH_SIZE } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { healthCheckAlerts, healthCheckLogs } from '../../db/schema/healthChecks.ts';
import {
	createBatchCleanupTask,
	createRetentionCleanupTask,
	cutoffDate,
} from '../schedulerService.ts';
import { getHealthConfig } from './healthConfigService.ts';

interface CheckHistoryEntry {
	checkType: string;
	createdAt: string;
	details: unknown;
	durationMs: null | number;
	id: number;
	status: string;
}

/**
 * Get health check history from database.
 *
 * @param limitCount - Maximum number of entries to return (default: HEALTH_CHECK_HISTORY_DEFAULT_LIMIT)
 * @returns Array of historical health check log entries
 */
export function getCheckHistory(limitCount = 100): CheckHistoryEntry[] {
	const db = getDb();

	const rows = db
		.select()
		.from(healthCheckLogs)
		.orderBy(desc(healthCheckLogs.createdAt))
		.limit(limitCount)
		.all();

	return rows.map((row) => {
		const ts = row.createdAt;
		const iso =
			ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : new Date(0).toISOString();
		return {
			checkType: row.checkType,
			createdAt: iso,
			details: row.details,
			durationMs: row.durationMs,
			id: row.id,
			status: row.status,
		};
	});
}

/**
 * Cleanup old health check logs based on retention policy.
 * Uses batched deletes (MAX_CLEANUP_BATCH_SIZE per batch, capped at MAX_CLEANUP_BATCHES)
 * to avoid long-running DELETEs locking the database.
 *
 * @returns Batch count and total number of logs deleted across batches
 */
export function cleanupOldLogs(): { batches: number; cleaned: number } {
	return createRetentionCleanupTask({
		getRetentionDays: () => getHealthConfig().logRetentionDays,
		table: healthCheckLogs as never,
		taskName: 'health-check-cleanup-logs-manual',
	})();
}

/**
 * Resolve stale alerts (alerts that have been active longer than retention period).
 * Uses batched updates to bound the work per batch and avoid long-held write locks.
 *
 * @returns Batch count and total number of alerts resolved across batches
 */
export function cleanupStaleAlerts(): { batches: number; cleaned: number } {
	return createBatchCleanupTask({
		deleteBatch: (db, now) => {
			const cutoff = cutoffDate(now, getHealthConfig().logRetentionDays);

			const idsToResolve = db
				.select({ id: healthCheckAlerts.id })
				.from(healthCheckAlerts)
				.where(
					and(
						isNull(healthCheckAlerts.resolvedAt),
						lt(healthCheckAlerts.createdAt, cutoff)
					)
				)
				.limit(MAX_CLEANUP_BATCH_SIZE)
				.all()
				.map((row) => row.id);

			if (idsToResolve.length === 0) {
				return 0;
			}

			db.update(healthCheckAlerts)
				.set({ resolvedAt: now })
				.where(sql`${healthCheckAlerts.id} IN ${idsToResolve}`)
				.run();

			return idsToResolve.length;
		},
		taskName: 'health-check-resolve-stale-alerts-manual',
	})();
}
