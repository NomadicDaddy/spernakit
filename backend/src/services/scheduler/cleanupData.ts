import { and, eq, like, lt, sql } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import {
	MAX_CLEANUP_BATCH_SIZE,
	SYSTEM_METRICS_RETENTION_DAYS,
	WEB_VITALS_RETENTION_DAYS,
} from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { auditLogs } from '../../db/schema/auditLogs.ts';
import { businessEvents } from '../../db/schema/businessEvents.ts';
import { systemMetrics } from '../../db/schema/systemMetrics.ts';
import { logScheduler } from '../../utils/logger.ts';
import { createRetentionCleanupTask, daysAgo, MAX_CLEANUP_BATCHES } from './cleanupUtils.ts';

function auditLogCleanupTask(): {
	batches: number;
	cleaned: number;
} {
	const config = getConfig();
	return createRetentionCleanupTask({
		getRetentionDays: () => config.retention.auditLogsDays,
		table: auditLogs as never,
		taskName: 'Audit log cleanup task',
	})();
}

function systemMetricsCleanupTask(): {
	batches: number;
	cleaned: number;
} {
	const config = getConfig();

	let totalCleaned = 0;
	let batches = 0;

	const cleanupMetricType = (metricType: 'system' | 'web-vital', retentionDays: number): void => {
		const taskName =
			metricType === 'system' ? 'System metrics cleanup task' : 'Web vitals cleanup task';
		const cutoff = daysAgo(retentionDays);

		let batchCleaned: number;
		do {
			const idsToDelete = db
				.select({ id: systemMetrics.id })
				.from(systemMetrics)
				.where(
					and(
						metricType === 'system'
							? eq(systemMetrics.metricType, 'system')
							: like(systemMetrics.metricType, 'web-vital-%'),
						lt(systemMetrics.createdAt, cutoff)
					)
				)
				.limit(MAX_CLEANUP_BATCH_SIZE)
				.all()
				.map((row) => row.id);

			if (idsToDelete.length === 0) break;

			db.delete(systemMetrics)
				.where(sql`${systemMetrics.id} IN ${idsToDelete}`)
				.run();

			batchCleaned = idsToDelete.length;
			totalCleaned += batchCleaned;
			batches++;

			if (batchCleaned > 0) {
				logScheduler('info', `${taskName} batch completed`, {
					batchCleaned,
					batchNumber: batches,
					totalCleaned,
				});
			}
		} while (batchCleaned > 0 && batches < MAX_CLEANUP_BATCHES);
	};

	const db = getDb();

	cleanupMetricType(
		'system',
		config.retention.systemMetricsDays ?? SYSTEM_METRICS_RETENTION_DAYS
	);
	cleanupMetricType('web-vital', WEB_VITALS_RETENTION_DAYS);

	logScheduler('info', 'System metrics cleanup task completed', {
		batches,
		cleaned: totalCleaned,
	});
	return { batches, cleaned: totalCleaned };
}

function businessEventsCleanupTask(): {
	batches: number;
	cleaned: number;
} {
	const config = getConfig();
	return createRetentionCleanupTask({
		getRetentionDays: () => config.retention.businessEventsDays,
		table: businessEvents as never,
		taskName: 'Business events cleanup task',
	})();
}

export { auditLogCleanupTask, businessEventsCleanupTask, systemMetricsCleanupTask };
