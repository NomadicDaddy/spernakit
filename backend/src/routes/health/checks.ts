import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	cleanupOldLogs,
	getActiveAlerts,
	getCheckHistory,
	runAndStoreChecks,
	runAndStoreSingleCheck,
} from '../../services/healthService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { notFoundError } from '../../utils/errorResponse.ts';

const healthChecksRoutes = new Elysia({
	detail: { tags: ['Health'] },
	prefix: '/health',
})
	.use(authPlugin)
	.get(
		'/details',
		async ({ set }) => {
			setCacheHeaders(set, 'SHORT');
			return dataResponse(await runAndStoreChecks());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			detail: {
				description:
					'Runs all health checks (database, memory, filesystem) and returns ' +
					'detailed results. Each check includes status (healthy/degraded/unhealthy), ' +
					'checkType, durationMs, and an overall status. Results are stored for ' +
					'history. Cached for 30 seconds. Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									degraded: dataExample('One check degraded', {
										checks: [
											{
												checkType: 'database',
												durationMs: 15,
												message: 'Database connection OK',
												status: 'healthy',
											},
											{
												checkType: 'memory',
												durationMs: 1,
												message: 'Memory usage above 80%',
												status: 'degraded',
											},
											{
												checkType: 'filesystem',
												durationMs: 4,
												message: 'Data directory writable',
												status: 'healthy',
											},
										],
										overall: 'degraded',
									}),
									healthy: dataExample('All checks healthy', {
										checks: [
											{
												checkType: 'database',
												durationMs: 12,
												message: 'Database connection OK',
												status: 'healthy',
											},
											{
												checkType: 'memory',
												durationMs: 1,
												message: 'Memory usage within limits',
												status: 'healthy',
											},
											{
												checkType: 'filesystem',
												durationMs: 3,
												message: 'Data directory writable',
												status: 'healthy',
											},
										],
										overall: 'healthy',
									}),
								},
							},
						},
						description: 'Health check results.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Get detailed health check results (OPERATOR+)',
			},
		}
	)
	.get(
		'/history',
		({ query, set }) => {
			// Historical data changes slowly - medium cache (5 min)
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse({
				alerts: getActiveAlerts(),
				history: getCheckHistory(query.limit),
			});
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns recent health check history (default 100 entries, configurable ' +
					'via limit query parameter) and all ' +
					'currently active (unresolved) alerts. History entries include checkType, ' +
					'status, durationMs, and createdAt. Alerts include severity ' +
					'(critical/warning), checkType, message, and timestamps. Cached for 5 ' +
					'minutes. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Recent history with one active alert', {
										alerts: [
											{
												checkType: 'memory',
												createdAt: '2026-01-15T10:30:00Z',
												id: 1,
												message: 'Memory usage above 80%',
												resolvedAt: null,
												severity: 'warning',
											},
										],
										history: [
											{
												checkType: 'database',
												createdAt: '2026-01-15T10:30:00Z',
												durationMs: 11,
												id: 50,
												status: 'healthy',
											},
											{
												checkType: 'memory',
												createdAt: '2026-01-15T10:30:00Z',
												durationMs: 2,
												id: 49,
												status: 'degraded',
											},
											{
												checkType: 'filesystem',
												createdAt: '2026-01-15T10:30:00Z',
												durationMs: 3,
												id: 48,
												status: 'healthy',
											},
										],
									}),
								},
							},
						},
						description: 'Health check history and active alerts.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Get health check history and active alerts (ADMIN+)',
			},
			query: t.Object({
				limit: t.Optional(t.Numeric({ default: 100, maximum: 1000, minimum: 1 })),
			}),
		}
	)
	.post(
		'/checks/:checkName/run',
		async ({ params, set }) => {
			const result = await runAndStoreSingleCheck(params.checkName);
			if (!result) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Health check');
			}
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Manually trigger a specific health check. Creates a new log entry ' +
					'and alert if check fails. Supported check types: database, memory, ' +
					'filesystem. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									database: dataExample('Database check passed', {
										checkType: 'database',
										details: { logCount: 12345 },
										durationMs: 12,
										status: 'healthy',
									}),
									memory: dataExample('Memory check degraded', {
										checkType: 'memory',
										details: {
											heapPercentage: 87,
											heapTotal: 536870912,
											heapUsed: 466071600,
											rss: 555732992,
										},
										durationMs: 2,
										status: 'degraded',
									}),
								},
							},
						},
						description: 'Health check result.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': {
						description: 'Health check not found or disabled.',
					},
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Run specific health check manually (ADMIN+)',
			},
			params: t.Object({
				checkName: t.String({
					maxLength: 50,
					minLength: 1,
					pattern: '^[a-z][a-z0-9_-]*$',
				}),
			}),
		}
	)
	.delete(
		'/logs',
		() => {
			const result = cleanupOldLogs();
			return dataResponse({ batches: result.batches, deleted: result.cleaned });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Cleanup old health check logs based on retention policy. Deletes ' +
					'logs older than logRetentionDays (default: 30 days) in bounded ' +
					'batches to avoid long write locks. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Old logs cleaned up', {
										batches: 11,
										deleted: 542,
									}),
								},
							},
						},
						description: 'Number of log entries deleted and batches executed.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Cleanup old health check logs (ADMIN+)',
			},
		}
	);

export { healthChecksRoutes };
