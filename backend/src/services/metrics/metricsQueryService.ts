import { and, desc, eq, gte, inArray, like, sql } from 'drizzle-orm';

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
	latest: null | number;
	latestRating: null | string;
	name: string;
	/**
	 * 75th percentile of the metric over the window, which is how Core Web Vitals
	 * are defined. Previously this was a mean, which hides the tail the CWV
	 * thresholds exist to catch: a page that is fast for most loads and janky for
	 * the slowest quarter averages out to "good" and reports no problem.
	 */
	p75: number;
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
 * The window is thinned down to `limitCount` points rather than cut off at its newest end. Taking
 * the newest `limitCount` rows made every range longer than `limitCount` minutes look the same:
 * the collector writes one sample a minute and the route caps the count at 100, so the dashboard's
 * 6h, 12h and 24h options all drew the same hundred minutes and the chart's x-axis did not grow
 * when the range did.
 *
 * The thinning keeps every nth row counting back from the newest, with n chosen so that what
 * survives fits under the cap, so a point is a sample that was really recorded rather than an
 * average of the ones around it. A window holding no more rows than the cap keeps all of them, at
 * full resolution, which is what the 1h range still gets.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @param limitCount - Maximum entries to return (default: 100)
 * @returns Array of stored metric entries, newest first
 */
function getMetricsHistory(hours = 24, limitCount = 100): StoredMetric[] {
	const db = getDb();
	const since = new Date(Date.now() - hours * MS_PER_HOUR);
	const sinceSqlParam = getSqlTimestampParam(since);
	// A caller reaching the service directly is not bound by the route's schema, and the stride
	// below divides by this.
	const points = Math.max(1, Math.trunc(limitCount));

	/*
	 * The stride is ceil(rows / points), written as (rows + points - 1) / points because both
	 * dialects apply integer division to integer operands. Window functions do the counting so the
	 * row set never crosses the wire; this is the same arrangement the p75 query below uses, and
	 * for the same reason.
	 */
	const sampledIds = db
		.select({ id: sql<number>`sampled.id` })
		.from(
			sql`(
				SELECT
					id,
					created_at,
					ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn,
					COUNT(*) OVER () AS cnt
				FROM ${systemMetrics}
				WHERE metric_type = 'system'
					AND created_at >= ${sinceSqlParam}
			) AS sampled`,
		)
		.where(sql`(sampled.rn - 1) % ((sampled.cnt + ${points} - 1) / ${points}) = 0`)
		.orderBy(sql`sampled.created_at DESC`)
		.limit(points)
		.all()
		.map((row) => row.id);

	if (sampledIds.length === 0) return [];

	const rows = db
		.select()
		.from(systemMetrics)
		.where(inArray(systemMetrics.id, sampledIds))
		.orderBy(desc(systemMetrics.createdAt))
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
 * Get p75 web vital metrics from the last N hours.
 *
 * Reports the 75th percentile because that is how Core Web Vitals are defined;
 * comparing a mean against a CWV threshold understates the tail.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @returns Array of web vital summaries
 */
function getWebVitalsSummary(hours = 24): WebVitalSummary[] {
	const db = getDb();
	const since = new Date(Date.now() - hours * MS_PER_HOUR);
	const sinceSqlParam = getSqlTimestampParam(since);

	// p75 per metric type, computed in SQL so no unbounded row set crosses the wire.
	//
	// PostgreSQL has percentile_cont() but SQLite does not, so this uses window
	// functions instead — supported by both, and already the established pattern here
	// (see the scheduler's ROW_NUMBER() OVER (PARTITION BY ...) task-list query).
	//
	// Rank of the p75 element is ceil(0.75 * n), expressed as (3n + 3) / 4 under the
	// integer division both dialects apply to integer operands: n=1 -> 1, n=2 -> 2,
	// n=4 -> 3, n=100 -> 75.
	//
	// `value` is nullable, so NULLs are excluded before ranking. Left in, they would
	// sort first on SQLite and last on PostgreSQL and shift the percentile differently
	// per dialect.
	const rows = db
		.select({
			metricType: sql<string>`ranked.metric_type`,
			p75: sql<number>`ranked.value`,
			sampleCount: sql<number>`ranked.cnt`,
		})
		.from(
			sql`(
				SELECT
					metric_type,
					value,
					ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY value) AS rn,
					COUNT(*) OVER (PARTITION BY metric_type) AS cnt
				FROM ${systemMetrics}
				WHERE metric_type LIKE 'web-vital-%'
					AND created_at >= ${sinceSqlParam}
					AND value IS NOT NULL
			) AS ranked`,
		)
		.where(sql`ranked.rn = (ranked.cnt * 3 + 3) / 4`)
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
				)`,
			),
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
			latest: latest?.latestValue ?? null,
			latestRating: latest?.latestRating ?? null,
			name: row.metricType.replace('web-vital-', '').toUpperCase(),
			p75: Math.round(Number(row.p75 ?? 0) * 1000) / 1000,
			sampleCount: Number(row.sampleCount),
			threshold: getMetricThreshold(row.metricType),
		};
	});
}

export { getLatestMetrics, getMetricsHistory, getWebVitalsSummary };
export type { WebVitalSummary };
