export {
	getDashboardStats,
	getEventSummary,
	getUserActivity,
	trackEvent,
} from './metrics/businessMetricsService.ts';
export {
	collectAndStoreMetrics,
	collectSnapshot,
	getRequestCount,
	incrementRequestCount,
	initializeMetricsService,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
	storeWebVitals,
} from './metrics/metricsCollectionService.ts';
export type { WebVitalSummary } from './metrics/metricsQueryService.ts';
export {
	getLatestMetrics,
	getMetricsHistory,
	getWebVitalsSummary,
} from './metrics/metricsQueryService.ts';
export type { EventCategory } from 'spernakit-shared';
