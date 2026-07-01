import type { MetricType, WidgetType } from 'spernakit-shared';

import { and, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { dashboardConfigs, dashboardWidgets } from '../../db/schema/dashboards.ts';
import { logger } from '../../utils/logger.ts';

/** Maximum widgets per dashboard — safety cap for unbounded queries. */
export const MAX_WIDGETS_PER_DASHBOARD = 100;

interface DashboardConfig {
	createdAt: Date;
	id: number;
	name: string;
	shareExpiresAt: Date | null;
	shareToken: null | string;
	updatedAt: Date;
	userId: number;
	workspaceId: null | number;
}

interface DashboardWidget {
	col: number;
	dashboardId: number;
	height: number;
	id: number;
	metricType: MetricType;
	options: null | Record<string, unknown>;
	refreshInterval: number;
	row: number;
	timeRange: string;
	title: string;
	widgetType: WidgetType;
	width: number;
}

interface DashboardWithWidgets extends DashboardConfig {
	widgets: DashboardWidget[];
}

/**
 * Fetch active (non-deleted) widgets for a dashboard.
 *
 * @param dashboardId - Dashboard ID
 * @returns Array of active widgets
 */
function getWidgetsForDashboard(dashboardId: number): DashboardWidget[] {
	try {
		const db = getDb();
		return db
			.select()
			.from(dashboardWidgets)
			.where(
				and(
					eq(dashboardWidgets.dashboardId, dashboardId),
					eq(dashboardWidgets.isDeleted, false)
				)
			)
			.limit(MAX_WIDGETS_PER_DASHBOARD)
			.all() as DashboardWidget[];
	} catch (err) {
		logger.error({ dashboardId, err }, 'Failed to fetch widgets for dashboard');
		throw err;
	}
}

interface WidgetInput {
	col: number;
	height: number;
	metricType: MetricType;
	options?: Record<string, unknown>;
	refreshInterval?: number;
	row: number;
	timeRange?: string;
	title: string;
	widgetType: WidgetType;
	width: number;
}

interface DashboardExport {
	name: string;
	version: 1;
	widgets: WidgetInput[];
}

/** Per-widget-type defaults for the factory function. */
const WIDGET_DEFAULTS: Record<
	WidgetType,
	{ defaultHeight: number; defaultMetricType?: MetricType; defaultWidth: number }
> = {
	alert_list: { defaultHeight: 3, defaultMetricType: 'system_alerts', defaultWidth: 6 },
	bar_chart: { defaultHeight: 3, defaultWidth: 6 },
	gauge: { defaultHeight: 2, defaultWidth: 3 },
	health_status: { defaultHeight: 2, defaultMetricType: 'health_status', defaultWidth: 4 },
	line_chart: { defaultHeight: 3, defaultWidth: 6 },
	stat_card: { defaultHeight: 2, defaultWidth: 3 },
	table: { defaultHeight: 4, defaultWidth: 6 },
};

interface CreateWidgetProps {
	col: number;
	metricType?: MetricType;
	row: number;
	timeRange?: string;
	title: string;
	width?: number;
}

function createWidget(type: WidgetType, props: CreateWidgetProps): WidgetInput {
	const defaults = WIDGET_DEFAULTS[type];
	return {
		col: props.col,
		height: defaults.defaultHeight,
		metricType: (props.metricType ?? defaults.defaultMetricType) as MetricType,
		row: props.row,
		...(props.timeRange ? { timeRange: props.timeRange } : {}),
		title: props.title,
		widgetType: type,
		width: props.width ?? defaults.defaultWidth,
	};
}

/**
 * Map widget inputs to Drizzle insert values for a dashboard.
 * @param widgets
 * @param dashboardId
 * @param userId - The user creating the widgets (for audit trail)
 * @returns Array of Drizzle insert values.
 */
function mapWidgetInputsToValues(
	widgets: WidgetInput[],
	dashboardId: number,
	userId: number
): (typeof dashboardWidgets.$inferInsert)[] {
	return widgets.map((w) => ({
		col: w.col,
		createdBy: userId,
		dashboardId,
		height: w.height,
		metricType: w.metricType,
		options: w.options ?? null,
		refreshInterval: w.refreshInterval ?? 60,
		row: w.row,
		timeRange: w.timeRange ?? '6h',
		title: w.title,
		updatedBy: userId,
		widgetType: w.widgetType,
		width: w.width,
	}));
}

/**
 * Find a non-deleted dashboard owned by a user, optionally scoped to an active workspace.
 *
 * Scoping rules:
 * - When workspaceId is a number, the dashboard must belong to that workspace (strict match).
 * - When workspaceId is null (SYSOP cross-workspace view or explicitly unscoped call),
 *   no workspace filter is applied.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The dashboard config or undefined if not found.
 */
function findOwnedDashboard(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null
): DashboardConfig | undefined {
	const db = getDb();
	const conditions = [
		eq(dashboardConfigs.id, dashboardId),
		eq(dashboardConfigs.userId, userId),
		eq(dashboardConfigs.isDeleted, false),
	];
	if (workspaceId !== null) {
		conditions.push(eq(dashboardConfigs.workspaceId, workspaceId));
	}
	return db
		.select()
		.from(dashboardConfigs)
		.where(and(...conditions))
		.get() as DashboardConfig | undefined;
}

export type {
	DashboardConfig,
	DashboardExport,
	DashboardWidget,
	DashboardWithWidgets,
	WidgetInput,
};
export { createWidget, findOwnedDashboard, getWidgetsForDashboard, mapWidgetInputsToValues };
