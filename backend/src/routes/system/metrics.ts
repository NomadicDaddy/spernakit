import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	clampLimit,
	DEFAULT_METRICS_HOURS,
	MAX_METRICS_HOURS,
	MAX_PAGE_LIMIT,
} from '../../constants/pagination.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	collectSnapshot,
	getLatestMetrics,
	getMetricsHistory,
	getWebVitalsSummary,
	storeWebVitals,
} from '../../services/metricsService.ts';
import { getConnectionCount } from '../../services/websocketService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';

const systemMetricsRoutes = new Elysia({
	detail: { tags: ['System'] },
	prefix: '/system',
})
	.use(authPlugin)
	.get(
		'/metrics',
		({ query, set }) => {
			// Metrics are real-time data - short cache (30s)
			setCacheHeaders(set, 'SHORT');
			// Defense-in-depth: explicitly clamp hours even though TypeBox validates
			const hours = Math.min(query.hours ?? DEFAULT_METRICS_HOURS, MAX_METRICS_HOURS);
			const limit = clampLimit(query.limit);

			const history = getMetricsHistory(hours, limit);
			const latest = getLatestMetrics();
			const current = collectSnapshot(getConnectionCount());

			return dataResponse({
				current: {
					activeConnections: current.activeConnections,
					cpuUsage: current.cpuUsage,
					memoryFree: current.memoryFree,
					memoryTotal: current.memoryTotal,
					memoryUsage: current.memoryUsage,
					requestCount: current.requestCount,
					timestamp: current.timestamp,
				},
				history,
				latest,
			});
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			detail: {
				description:
					'Returns current system metrics plus historical data. Includes CPU ' +
					'usage, memory usage/free/total, active connections, and request count. ' +
					'The `hours` parameter controls how far back history extends (1-720, ' +
					'default 6). The `limit` parameter caps the number of history entries ' +
					'(1-100). Cached for 30s. Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Current metrics with history', {
										current: {
											activeConnections: 5,
											cpuUsage: 18.3,
											memoryFree: 4096,
											memoryTotal: 16384,
											memoryUsage: 75.0,
											requestCount: 12340,
											timestamp: '2026-02-03T12:00:00.000Z',
										},
										history: [
											{
												activeConnections: 4,
												cpuUsage: 15.1,
												memoryUsage: 72.8,
												requestCount: 12100,
												timestamp: '2026-02-03T11:55:00.000Z',
											},
											{
												activeConnections: 3,
												cpuUsage: 22.7,
												memoryUsage: 74.1,
												requestCount: 11900,
												timestamp: '2026-02-03T11:50:00.000Z',
											},
										],
										latest: {
											cpuUsage: 18.3,
											memoryUsage: 75.0,
											requestCount: 12340,
											timestamp: '2026-02-03T12:00:00.000Z',
										},
									}),
								},
							},
						},
						description: 'System metrics with current snapshot and history.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get system metrics with history',
			},
			query: t.Object({
				hours: t.Optional(
					t.Numeric({
						default: DEFAULT_METRICS_HOURS,
						maximum: MAX_METRICS_HOURS,
						minimum: 1,
					})
				),
				limit: t.Optional(
					t.Numeric({ default: MAX_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT, minimum: 1 })
				),
			}),
		}
	)
	.post(
		'/web-vitals',
		({ body, set, user }) => {
			const authUser = assertUser(user);

			// Use service layer instead of direct DB access
			storeWebVitals({
				metrics: body.metrics,
				url: body.url,
				userId: authUser.id,
			});

			set.status = HTTP_STATUS.NO_CONTENT;
			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				metrics: t.Array(
					t.Object({
						name: t.String({ maxLength: 50 }),
						navigationType: t.String({ maxLength: 50 }),
						rating: t.String({ maxLength: 20 }),
						value: t.Number(),
					}),
					{ maxItems: 50 }
				),
				timestamp: t.String({ maxLength: 50 }),
				url: t.String({ maxLength: 2048 }),
			}),
			detail: {
				description:
					'Receives a batch of Core Web Vitals measurements from the ' +
					'frontend (CLS, FCP, INP, LCP, TTFB). Each metric includes name, ' +
					'value, rating, and navigationType. Stored for historical analysis. ' +
					'Returns 204 No Content on success. Requires authentication.',
				responses: {
					'204': {
						description: 'Web vitals stored successfully. No response body.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Receive frontend Core Web Vitals batch',
			},
		}
	)
	.get(
		'/web-vitals',
		({ query, set }) => {
			// Web vitals summary - medium cache (5 min)
			setCacheHeaders(set, 'MEDIUM');
			// Defense-in-depth: explicitly clamp hours even though TypeBox validates
			const hours = Math.min(query.hours ?? DEFAULT_METRICS_HOURS, MAX_METRICS_HOURS);
			return dataResponse(getWebVitalsSummary(hours));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			detail: {
				description:
					'Returns enhanced Core Web Vitals summary with latest values, ' +
					'ratings, and threshold comparisons for each metric. Includes ' +
					'average, latest measurement, latest rating, threshold value, and ' +
					'sample count. Default time window is 6 hours. Cached for 5 ' +
					'minutes. Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Web Vitals summary over 6 hours', [
										{
											average: 0.05,
											latest: 0.08,
											latestRating: 'good',
											name: 'CLS',
											sampleCount: 342,
											threshold: 0.1,
										},
										{
											average: 1200,
											latest: 1350,
											latestRating: 'needs-improvement',
											name: 'FCP',
											sampleCount: 342,
											threshold: 1800,
										},
										{
											average: 85,
											latest: 210,
											latestRating: 'poor',
											name: 'INP',
											sampleCount: 342,
											threshold: 200,
										},
										{
											average: 1800,
											latest: 2150,
											latestRating: 'needs-improvement',
											name: 'LCP',
											sampleCount: 342,
											threshold: 2500,
										},
										{
											average: 180,
											latest: 580,
											latestRating: 'needs-improvement',
											name: 'TTFB',
											sampleCount: 342,
											threshold: 600,
										},
									]),
								},
							},
						},
						description: 'Enhanced Web Vitals summary with ratings and thresholds.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get Core Web Vitals summary (OPERATOR+)',
			},
			query: t.Object({
				hours: t.Optional(
					t.Numeric({
						default: DEFAULT_METRICS_HOURS,
						maximum: MAX_METRICS_HOURS,
						minimum: 1,
					})
				),
			}),
		}
	);

export { systemMetricsRoutes };
