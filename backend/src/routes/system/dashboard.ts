import { Elysia } from 'elysia';
import { LRUCache } from 'lru-cache';

import { DASHBOARD_CACHE_TTL_MS } from '../../constants/dashboard.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	missingWorkspaceHeaderExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser } from '../../guards/role.ts';
import { requireSelectedWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import { getTotalCount } from '../../services/auditService.ts';
import { runAllChecks } from '../../services/healthService.ts';
import { collectSnapshot, getRequestCount } from '../../services/metricsService.ts';
import { getUnreadCount } from '../../services/notificationService.ts';
import { getTotalUserCount } from '../../services/userService.ts';
import { getConnectionCount } from '../../services/websocketService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';

/** Dashboard response shape */
interface DashboardResponse {
	auditEvents: number;
	metrics: {
		activeConnections: number;
		cpuUsage: number;
		memoryUsage: number;
		requestCount: number;
	};
	systemHealth: string;
	totalUsers: number;
	unreadNotifications: number;
}

/** LRU cache for dashboard responses, keyed by "userId:workspaceId". Max 500 entries, TTL-based. */
const dashboardCache = new LRUCache<string, DashboardResponse>({
	max: 500,
	ttl: DASHBOARD_CACHE_TTL_MS,
});

/**
 * Get cached dashboard response or compute fresh data.
 *
 * The figures follow the header, whoever sent it: a caller who named a workspace is counting that
 * workspace, and only a caller who named none gets the totals across all of them. Who is allowed
 * to ask for those was settled by requireSelectedWorkspaceAccess before this runs. See
 * backend/src/guards/workspaceHeader.ts. The cache key carries the same distinction, so the two
 * answers cannot be served from each other's entry.
 *
 * @param userId - The caller, whose own unread count is part of the response.
 * @param workspaceId - The workspace the header named, or null for the cross-workspace totals.
 * @returns The dashboard figures, cached or freshly computed.
 */
function getDashboardData(userId: number, workspaceId: null | number): DashboardResponse {
	const cacheKey = `${userId}:${workspaceId ?? 'all'}`;

	const cached = dashboardCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const totalUsers = getTotalUserCount();
	const unreadNotifications = getUnreadCount(userId, workspaceId);
	const auditEvents = getTotalCount(workspaceId);
	const healthResult = runAllChecks();
	const snapshot = collectSnapshot(getConnectionCount());

	const data: DashboardResponse = {
		auditEvents,
		metrics: {
			activeConnections: snapshot.activeConnections,
			cpuUsage: snapshot.cpuUsage,
			memoryUsage: snapshot.memoryUsage,
			requestCount: getRequestCount(),
		},
		systemHealth: healthResult.status,
		totalUsers,
		unreadNotifications,
	};

	dashboardCache.set(cacheKey, data);
	return data;
}

const systemDashboardRoutes = new Elysia({
	detail: { tags: ['System'] },
	prefix: '/system',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.get(
		'/dashboard',
		({ set, user, workspaceId }) => {
			const authUser = assertUser(user);
			// Dashboard updates frequently - short cache (30s)
			setCacheHeaders(set, 'SHORT');
			return dataResponse(getDashboardData(authUser.id, workspaceId));
		},
		{
			beforeHandle: ({ set, user, workspaceId }) =>
				requireSelectedWorkspaceAccess({ set, user, workspaceId }),
			detail: {
				description:
					'Returns aggregate dashboard statistics: total users, unread ' +
					'notifications, audit event count, system health status, and real-time ' +
					'metrics (CPU, memory, active WebSocket connections, request count). ' +
					'Scoped to the workspace named by the X-Workspace-ID header; a SYSOP may ' +
					'leave the header off for the totals across every workspace, and for anyone ' +
					'else a request that names no workspace is answered 400. ' +
					'Cached server-side for a short duration. Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Dashboard statistics', {
										auditEvents: 1284,
										metrics: {
											activeConnections: 3,
											cpuUsage: 12.5,
											memoryUsage: 64.2,
											requestCount: 4821,
										},
										systemHealth: 'healthy',
										totalUsers: 8,
										unreadNotifications: 5,
									}),
								},
							},
						},
						description: 'Dashboard statistics retrieved successfully.',
					},
					'400': missingWorkspaceHeaderExample(),
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get dashboard statistics (OPERATOR+)',
			},
			requireRole: 'OPERATOR',
		},
	);

export { systemDashboardRoutes };
