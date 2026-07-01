import { and, lt, type SQL, sql } from 'drizzle-orm';

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
	return createBatchCleanupTask({
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
}

export {
	createBatchCleanupTask,
	createRetentionCleanupTask,
	cutoffDate,
	daysAgo,
	MAX_CLEANUP_BATCHES,
};
export type { DbClient };
