import { and, lt, sql, type SQL } from 'drizzle-orm';

import { MAX_CLEANUP_BATCH_SIZE, MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { logScheduler } from '../../utils/logger.ts';

type DbClient = ReturnType<typeof getDb>;

const MAX_CLEANUP_BATCHES = 100;

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * MS_PER_DAY);
}

function cutoffDate(now: Date, retentionDays: number): Date {
	return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/**
 * `retention.*Days` of `0` means "never purge". Callers that compute their own cutoff must check this
 * first: `cutoffDate(now, 0)` is *now*, and a delete below it would empty the table.
 *
 * @param retentionDays - The configured `retention.*Days` window
 * @returns true when the window is 0 (or otherwise not a positive number), i.e. purging is disabled
 */
function isRetentionDisabled(retentionDays: number): boolean {
	return !(retentionDays > 0);
}

/**
 * The no-op result a cleanup task returns when its retention is disabled, with the log line to match.
 *
 * @param taskName - Human-readable task name for the skip log line
 * @returns Zero batches, zero rows cleaned
 */
function retentionDisabledResult(taskName: string): { batches: number; cleaned: number } {
	logScheduler('info', `${taskName} skipped: retention disabled (0 days)`);
	return { batches: 0, cleaned: 0 };
}

function createBatchCleanupTask(options: {
	deleteBatch: (db: DbClient, now: Date) => number;
	taskName: string;
}): () => { batches: number; cleaned: number } {
	return () => {
		const db = getDb();
		const now = new Date();
		let totalCleaned = 0;
		let batches = 0;

		let batchCleaned = options.deleteBatch(db, now);
		while (batchCleaned > 0 && batches < MAX_CLEANUP_BATCHES) {
			totalCleaned += batchCleaned;
			batches++;
			logScheduler('info', `${options.taskName} batch completed`, {
				batchCleaned,
				batchNumber: batches,
				totalCleaned,
			});
			batchCleaned = options.deleteBatch(db, now);
		}

		if (batches >= MAX_CLEANUP_BATCHES) {
			logScheduler('warn', `${options.taskName} hit batch cap, remaining work deferred`, {
				batches,
				cleaned: totalCleaned,
			});
		}

		logScheduler('info', `${options.taskName} completed`, { batches, cleaned: totalCleaned });
		return { batches, cleaned: totalCleaned };
	};
}

function createRetentionCleanupTask(options: {
	extraCondition?: SQL;
	getRetentionDays: () => number;
	table: {
		_table: never;
		createdAt: SQL;
		id: SQL;
	};
	taskName: string;
}): () => { batches: number; cleaned: number } {
	const run = createBatchCleanupTask({
		deleteBatch: (db, now) => {
			const cutoff = cutoffDate(now, options.getRetentionDays());
			const condition = options.extraCondition
				? and(lt(options.table.createdAt, cutoff), options.extraCondition)
				: lt(options.table.createdAt, cutoff);

			const idsToDelete = db
				.select({ id: options.table.id })
				.from(options.table as never)
				.where(condition)
				.limit(MAX_CLEANUP_BATCH_SIZE)
				.all()
				.map((row) => (row as { id: number }).id);

			if (idsToDelete.length === 0) {
				return 0;
			}

			db.delete(options.table as never)
				.where(sql`${options.table.id} IN ${idsToDelete}`)
				.run();

			return idsToDelete.length;
		},
		taskName: options.taskName,
	});
	return () =>
		isRetentionDisabled(options.getRetentionDays())
			? retentionDisabledResult(options.taskName)
			: run();
}

export {
	createBatchCleanupTask,
	createRetentionCleanupTask,
	cutoffDate,
	daysAgo,
	isRetentionDisabled,
	MAX_CLEANUP_BATCHES,
	retentionDisabledResult,
};
export type { DbClient };
