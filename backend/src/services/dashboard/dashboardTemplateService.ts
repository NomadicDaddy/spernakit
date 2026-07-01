import type { DashboardExport, DashboardWithWidgets } from './dashboardTypes.ts';

import { importDashboard } from './dashboardExportService.ts';
import { createWidget } from './dashboardTypes.ts';

const DASHBOARD_TEMPLATES: Record<string, DashboardExport> = {
	api_performance: {
		name: 'API Performance',
		version: 1,
		widgets: [
			createWidget('stat_card', {
				col: 0,
				metricType: 'request_count',
				row: 0,
				title: 'Request Count',
			}),
			createWidget('stat_card', {
				col: 3,
				metricType: 'active_connections',
				row: 0,
				title: 'Active Connections',
			}),
			createWidget('gauge', { col: 6, metricType: 'cpu_usage', row: 0, title: 'CPU Usage' }),
			createWidget('gauge', {
				col: 9,
				metricType: 'memory_usage',
				row: 0,
				title: 'Memory Usage',
			}),
			createWidget('line_chart', {
				col: 0,
				metricType: 'request_count',
				row: 2,
				timeRange: '24h',
				title: 'Request Count Over Time',
				width: 6,
			}),
			createWidget('bar_chart', {
				col: 6,
				metricType: 'audit_events',
				row: 2,
				timeRange: '24h',
				title: 'Audit Events',
				width: 6,
			}),
		],
	},
	security: {
		name: 'Security Overview',
		version: 1,
		widgets: [
			createWidget('stat_card', {
				col: 0,
				metricType: 'audit_events',
				row: 0,
				title: 'Audit Events',
				width: 4,
			}),
			createWidget('stat_card', {
				col: 4,
				metricType: 'total_users',
				row: 0,
				title: 'Total Users',
				width: 4,
			}),
			createWidget('health_status', { col: 8, row: 0, title: 'System Health', width: 4 }),
			createWidget('alert_list', { col: 0, row: 2, title: 'Active Alerts', width: 6 }),
			createWidget('line_chart', {
				col: 6,
				metricType: 'audit_events',
				row: 2,
				timeRange: '24h',
				title: 'Audit Events Over Time',
				width: 6,
			}),
		],
	},
	system_overview: {
		name: 'System Overview',
		version: 1,
		widgets: [
			createWidget('gauge', { col: 0, metricType: 'cpu_usage', row: 0, title: 'CPU Usage' }),
			createWidget('gauge', {
				col: 3,
				metricType: 'memory_usage',
				row: 0,
				title: 'Memory Usage',
			}),
			createWidget('stat_card', {
				col: 6,
				metricType: 'request_count',
				row: 0,
				title: 'Request Count',
			}),
			createWidget('health_status', { col: 9, row: 0, title: 'System Health' }),
			createWidget('line_chart', {
				col: 0,
				metricType: 'cpu_usage',
				row: 2,
				timeRange: '6h',
				title: 'CPU Usage Over Time',
				width: 6,
			}),
			createWidget('line_chart', {
				col: 6,
				metricType: 'memory_usage',
				row: 2,
				timeRange: '6h',
				title: 'Memory Usage Over Time',
				width: 6,
			}),
			createWidget('alert_list', { col: 0, row: 5, title: 'Active Alerts', width: 12 }),
		],
	},
	user_activity: {
		name: 'User Activity',
		version: 1,
		widgets: [
			createWidget('stat_card', {
				col: 0,
				metricType: 'total_users',
				row: 0,
				title: 'Total Users',
				width: 4,
			}),
			createWidget('stat_card', {
				col: 4,
				metricType: 'active_connections',
				row: 0,
				title: 'Active Connections',
				width: 4,
			}),
			createWidget('stat_card', {
				col: 8,
				metricType: 'business_events',
				row: 0,
				title: 'Business Events',
				width: 4,
			}),
			createWidget('line_chart', {
				col: 0,
				metricType: 'business_events',
				row: 2,
				timeRange: '24h',
				title: 'User Events Over Time',
				width: 6,
			}),
			createWidget('bar_chart', {
				col: 6,
				metricType: 'business_events',
				row: 2,
				timeRange: '7d',
				title: 'Event Category Breakdown',
				width: 6,
			}),
		],
	},
};

/**
 * List available dashboard templates.
 * @returns Array of template summaries with id, name, and widget count.
 */
function listTemplates(): { id: string; name: string; widgetCount: number }[] {
	return Object.entries(DASHBOARD_TEMPLATES).map(([id, template]) => ({
		id,
		name: template.name,
		widgetCount: template.widgets.length,
	}));
}

/**
 * Create a dashboard from a template.
 * Throws if importDashboard fails — callers handle errors at the route level.
 *
 * @param userId
 * @param templateId
 * @param workspaceId - Destination workspace (null for SYSOP global)
 * @returns The created dashboard with widgets, or null if template not found.
 */
function createFromTemplate(
	userId: number,
	templateId: string,
	workspaceId: null | number = null
): DashboardWithWidgets | null {
	const template = DASHBOARD_TEMPLATES[templateId];
	if (!template) return null;

	return importDashboard(userId, template, workspaceId);
}

export { createFromTemplate, listTemplates };
