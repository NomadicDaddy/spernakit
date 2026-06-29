import { desc, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { systemMetrics } from '../../db/schema/systemMetrics.ts';

interface DatabaseIntegrityStatus {
	healthy: boolean;
	lastCheckAt: null | string;
	message: null | string;
	mode: null | string;
}

/**
 * Get last database integrity check result from system_metrics.
 *
 * @returns Last integrity check status or null if never run
 */
export function getLastIntegrityCheck(): DatabaseIntegrityStatus | null {
	const db = getDb();
	const row = db
		.select()
		.from(systemMetrics)
		.where(eq(systemMetrics.metricType, 'database_integrity'))
		.orderBy(desc(systemMetrics.createdAt))
		.limit(1)
		.get();

	if (!row) {
		return null;
	}

	const metadata = row.metadata as {
		durationMs?: number;
		message?: string;
		mode?: string;
	} | null;
	return {
		healthy: row.value === 1,
		lastCheckAt:
			row.createdAt && !Number.isNaN(row.createdAt.getTime())
				? row.createdAt.toISOString()
				: null,
		message: metadata?.message ?? null,
		mode: metadata?.mode ?? null,
	};
}
