import { getTotalCount } from '../auditService.ts';
import { runAllChecks, runAndStoreChecks } from '../health/healthChecks.ts';
import { collectAndStoreMetrics, getRequestCount } from '../metricsService.ts';
import { getTotalUserCount } from '../userService.ts';
import { broadcastDashboardUpdate, getConnectionCount } from '../websocketService.ts';

/**
 * Metrics collection task - collects system metrics and broadcasts dashboard updates.
 *
 * @returns CPU and memory usage metrics
 */
function metricsCollectionTask(): { cpu: number; memory: number } {
	const activeConnections = getConnectionCount();
	const snapshot = collectAndStoreMetrics(activeConnections);

	const totalUsers = getTotalUserCount();
	const auditEvents = getTotalCount(null);
	const healthResult = runAllChecks();

	broadcastDashboardUpdate({
		auditEvents,
		metrics: {
			activeConnections: snapshot.activeConnections,
			cpuUsage: snapshot.cpuUsage,
			memoryUsage: snapshot.memoryUsage,
			requestCount: getRequestCount(),
		},
		systemHealth: healthResult.status,
		totalUsers,
	});

	return { cpu: snapshot.cpuUsage, memory: snapshot.memoryUsage };
}

/**
 * Health check execution task - runs all health checks, stores results, and triggers alerts.
 *
 * @returns Aggregated health check result
 */
async function healthCheckExecutionTask(): Promise<{ status: string }> {
	const result = await runAndStoreChecks();
	return { status: result.status };
}

export { healthCheckExecutionTask, metricsCollectionTask };
