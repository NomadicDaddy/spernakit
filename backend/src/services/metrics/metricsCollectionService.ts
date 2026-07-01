import type { SystemMetricType } from 'spernakit-shared';

import { eq } from 'drizzle-orm';
import { freemem, totalmem } from 'node:os';

import { getDb } from '../../db/index.ts';
import { settings } from '../../db/schema/settings.ts';
import { systemMetrics } from '../../db/schema/systemMetrics.ts';
import { logger } from '../../utils/logger.ts';
import {
	getCpuUsage,
	getDiskUsagePercent,
	getEventLoopLatency,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
} from './metricsHelpers.ts';

/** Settings key for persisting request counter */
const REQUEST_COUNT_KEY = 'metrics.requestCount';

interface MetricSnapshot {
	activeConnections: number;
	cpuUsage: number;
	memoryFree: number;
	memoryTotal: number;
	memoryUsage: number;
	requestCount: number;
	rss: number;
	timestamp: string;
}

interface WebVitalMetric {
	name: string;
	navigationType: string;
	rating: string;
	value: number;
}

interface StoreWebVitalsInput {
	metrics: WebVitalMetric[];
	url: string;
	userId: number;
}

interface StoredMetric {
	cpuUsage: null | number;
	heapTotal: null | number;
	heapUsed: null | number;
	memoryUsage: null | number;
	rss: null | number;
	timestamp: string;
}

let totalRequests = 0;

/**
 * Load the persisted request counter from settings on startup.
 */
function loadPersistedRequestCount(): void {
	const db = getDb();
	const row = db.select().from(settings).where(eq(settings.key, REQUEST_COUNT_KEY)).get();
	if (row?.value) {
		const parsed = parseInt(row.value, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			totalRequests = parsed;
			logger.debug({ requestCount: totalRequests }, 'Loaded persisted request counter');
		}
	}
}

/**
 * Persist the current request counter to settings.
 */
function persistRequestCount(): void {
	const db = getDb();
	const value = String(totalRequests);
	db.insert(settings)
		.values({ key: REQUEST_COUNT_KEY, value })
		.onConflictDoUpdate({
			set: { updatedAt: new Date(), value },
			target: settings.key,
		})
		.run();
}

/** Increment global request counter. */
function incrementRequestCount(): void {
	totalRequests++;
}

/**
 * Get current total request count.
 *
 * @returns Current total request count since server start
 */
function getRequestCount(): number {
	return totalRequests;
}

/**
 * Collect a snapshot of current system metrics.
 *
 * @param activeConnections - Number of active WebSocket connections
 * @returns Current metric snapshot
 */
function collectSnapshot(activeConnections: number): MetricSnapshot {
	const mem = process.memoryUsage();
	const cpuUsage = getCpuUsage();
	const osTotal = totalmem();
	const osFree = freemem();
	const osUsed = osTotal - osFree;

	return {
		activeConnections,
		cpuUsage,
		memoryFree: osFree,
		memoryTotal: osTotal,
		memoryUsage: osTotal > 0 ? Math.min(Math.round((osUsed / osTotal) * 1000) / 10, 100) : 0,
		requestCount: totalRequests,
		rss: mem.rss,
		timestamp: new Date().toISOString(),
	};
}

/**
 * Collect and store system metrics in the database.
 * Also persists the request counter to survive restarts.
 *
 * @param activeConnections - Number of active WebSocket connections
 * @returns Collected metric snapshot
 */
function collectAndStoreMetrics(activeConnections: number): MetricSnapshot {
	const snapshot = collectSnapshot(activeConnections);
	const db = getDb();
	const diskUsage = getDiskUsagePercent();
	const heap = process.memoryUsage();

	db.insert(systemMetrics)
		.values({
			cpuUsage: snapshot.cpuUsage,
			diskUsage,
			eventLoopLatency: getEventLoopLatency(),
			heapTotal: heap.heapTotal,
			heapUsed: heap.heapUsed,
			memoryUsage: snapshot.memoryUsage,
			metricType: 'system',
			rss: snapshot.rss,
			value: null,
		})
		.run();

	persistRequestCount();

	return snapshot;
}

/**
 * Store frontend web vitals metrics in the database.
 *
 * @param input - Web vitals data including metrics, url, and userId
 */
function storeWebVitals(input: StoreWebVitalsInput): void {
	const db = getDb();

	const metricsToInsert = input.metrics.map((metric) => ({
		metadata: {
			navigationType: metric.navigationType,
			rating: metric.rating,
			url: input.url,
			userId: input.userId,
		},
		metricType: `web-vital-${metric.name.toLowerCase()}` as SystemMetricType,
		value: metric.value,
	}));

	if (metricsToInsert.length > 0) {
		db.insert(systemMetrics).values(metricsToInsert).run();
	}

	for (const metric of input.metrics) {
		if (metric.rating === 'poor') {
			logger.warn(
				{
					metric: metric.name,
					rating: metric.rating,
					url: input.url,
					userId: input.userId,
				},
				`Web vital metric "${metric.name}" exceeded threshold (rating: poor)`
			);
		}
	}
}

/**
 * Initialize metrics collection service.
 * Loads persisted request counter from database on startup.
 */
function initializeMetricsService(): void {
	loadPersistedRequestCount();
	logger.info({ requestCount: totalRequests }, 'Metrics service initialized');
}

export {
	collectAndStoreMetrics,
	collectSnapshot,
	getCpuUsage,
	getRequestCount,
	incrementRequestCount,
	initializeMetricsService,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
	storeWebVitals,
};
export type { MetricSnapshot, StoredMetric, StoreWebVitalsInput, WebVitalMetric };
