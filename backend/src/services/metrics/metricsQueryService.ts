import { and, avg, count, desc, eq, gte, like, sql } from 'drizzle-orm';

import type { StoredMetric } from './metricsCollectionService.ts';

import { MS_PER_HOUR } from '../../constants/scheduler.ts';
import {
	CLS_THRESHOLD,
	FCP_THRESHOLD,
	INP_THRESHOLD,
	LCP_THRESHOLD,
	TTFB_THRESHOLD,
} from '../../constants/webVitals.ts';
import { getDb, getSqlTimestampParam } from '../../db/index.ts';
import { systemMetrics } from '../../db/schema/systemMetrics.ts';

interface WebVitalSummary {
	average: number;
	latest: null | number;
	latestRating: null | string;
	name: string;
	sampleCount: number;
	threshold: number;
}

interface WebVitalLatest {
	latestRating: null | string;
	latestValue: null | number;
	metricType: string;
}

function getWebVitalRating(metadata: unknown): null | string {
	if (typeof metadata !== 'object' || metadata === null || !('rating' in metadata)) return null;

	const rating = String((metadata as { rating: unknown }).rating ?? '');
	return rating || null;
}

/**
 * Query metrics history for a time range.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @param limitCount - Maximum entries to return (default: 100)
 * @returns Array of stored metric entries
 */
function getMetricsHistory(hours = 24, limitCount = 100): StoredMetric[] {
	const db = getDb();
	const since = new Date(Date.now() - hours * MS_PER_HOUR);

	const rows = db
		.select()
		.from(systemMetrics)
		.where(and(eq(systemMetrics.metricType, 'system'), gte(systemMetrics.createdAt, since)))
		.orderBy(desc(systemMetrics.createdAt))
		.limit(limitCount)
		.all();

	return rows.map((row) => ({
		cpuUsage: row.cpuUsage,
		heapTotal: row.heapTotal,
		heapUsed: row.heapUsed,
		memoryUsage: row.memoryUsage,
		rss: row.rss,
		timestamp: row.createdAt.toISOString(),
	}));
}

/**
 * Get the latest metric snapshot from the database.
 *
 * @returns Latest stored metric or null if none exist
 */
function getLatestMetrics(): null | StoredMetric {
	const db = getDb();

	const row = db
		.select()
		.from(systemMetrics)
		.where(eq(systemMetrics.metricType, 'system'))
		.orderBy(desc(systemMetrics.createdAt))
		.limit(1)
		.get();

	if (!row) return null;

	return {
		cpuUsage: row.cpuUsage,
		heapTotal: row.heapTotal,
		heapUsed: row.heapUsed,
		memoryUsage: row.memoryUsage,
		rss: row.rss,
		timestamp: row.createdAt.toISOString(),
	};
}

/**
 * Map a web-vital metric type (e.g. "web-vital-lcp") to its "good" threshold.
 *
 * @param metricType - The metric type identifier (e.g. "web-vital-lcp")
 * @returns The threshold value for the metric, or 0 if unknown
 */
function getMetricThreshold(metricType: string): number {
	const metric = metricType.replace('web-vital-', '').toLowerCase();
	switch (metric) {
		case 'cls':
			return CLS_THRESHOLD;
		case 'fcp':
			return FCP_THRESHOLD;
		case 'inp':
			return INP_THRESHOLD;
		case 'lcp':
			return LCP_THRESHOLD;
		case 'ttfb':
			return TTFB_THRESHOLD;
		default:
			return 0;
	}
}

/**
 * Get average web vital metrics from the last N hours.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @returns Array of web vital summaries
 */
function getWebVitalsSummary(hours = 24): WebVitalSummary[] {
	const db = getDb();
	const since = new Date(Date.now() - hours * MS_PER_HOUR);
	const sinceSqlParam = getSqlTimestampParam(since);

	const rows = db
		.select({
			average: avg(systemMetrics.value),
			metricType: systemMetrics.metricType,
			sampleCount: count(systemMetrics.id),
		})
		.from(systemMetrics)
		.where(
			and(like(systemMetrics.metricType, 'web-vital-%'), gte(systemMetrics.createdAt, since))
		)
		.groupBy(systemMetrics.metricType)
		.all();

	const latestRows = db
		.select({
			latestValue: systemMetrics.value,
			metadata: systemMetrics.metadata,
			metricType: systemMetrics.metricType,
		})
		.from(systemMetrics)
		.where(
			and(
				like(systemMetrics.metricType, 'web-vital-%'),
				gte(systemMetrics.createdAt, since),
				sql`${systemMetrics.createdAt} = (
					SELECT MAX(sm2.created_at) FROM ${systemMetrics} sm2
					WHERE sm2.metric_type = ${systemMetrics.metricType}
					AND sm2.created_at >= ${sinceSqlParam}
				)`
			)
		)
		.all();

	const latestMap = new Map<string, WebVitalLatest>();
	for (const row of latestRows) {
		latestMap.set(row.metricType, {
			latestRating: getWebVitalRating(row.metadata),
			latestValue: row.latestValue,
			metricType: row.metricType,
		});
	}

	return rows.map((row) => {
		const latest = latestMap.get(row.metricType);
		return {
			average: Math.round(Number(row.average ?? 0) * 1000) / 1000,
			latest: latest?.latestValue ?? null,
			latestRating: latest?.latestRating ?? null,
			name: row.metricType.replace('web-vital-', '').toUpperCase(),
			sampleCount: Number(row.sampleCount),
			threshold: getMetricThreshold(row.metricType),
		};
	});
}

export { getLatestMetrics, getMetricsHistory, getWebVitalsSummary };
export type { WebVitalSummary };
