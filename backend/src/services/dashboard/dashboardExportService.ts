import type { MetricType, WidgetType } from 'spernakit-shared';

import type { DashboardExport, DashboardWithWidgets } from './dashboardTypes.ts';

import { createDashboard, getDashboard } from './dashboardCrud.ts';

/**
 * Export a dashboard configuration as a portable JSON structure.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The exported dashboard data, or null if not found.
 */
function exportDashboard(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null
): DashboardExport | null {
	const dashboard = getDashboard(dashboardId, userId, workspaceId);
	if (!dashboard) return null;

	return {
		name: dashboard.name,
		version: 1,
		widgets: dashboard.widgets.map((w) => ({
			col: w.col,
			height: w.height,
			metricType: w.metricType as MetricType,
			...(w.options ? { options: w.options } : {}),
			refreshInterval: w.refreshInterval,
			row: w.row,
			timeRange: w.timeRange,
			title: w.title,
			widgetType: w.widgetType as WidgetType,
			width: w.width,
		})),
	};
}

/**
 * Import a dashboard from an exported JSON structure into the given workspace.
 *
 * @param userId
 * @param data
 * @param workspaceId - Destination workspace (null for SYSOP global)
 * @returns The newly created dashboard with its widgets.
 */
function importDashboard(
	userId: number,
	data: DashboardExport,
	workspaceId: null | number = null
): DashboardWithWidgets {
	if (data.version !== 1) {
		throw new Error(`Unsupported dashboard export version: ${data.version}`);
	}

	return createDashboard(userId, {
		name: data.name,
		widgets: data.widgets,
		workspaceId,
	});
}

export { exportDashboard, importDashboard };
