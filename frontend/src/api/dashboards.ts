import type { MetricType, WidgetType } from 'spernakit-shared';

import type { DataResponse, SuccessResponse } from './types';

import { apiClient } from './client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** A single widget placed on a dashboard, with position, size, and data source configuration. */
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

/** Dashboard metadata (name, owner, share token) without widget details. */
interface DashboardConfig {
	createdAt: string;
	id: number;
	name: string;
	shareExpiresAt: null | string;
	shareToken: null | string;
	updatedAt: string;
	userId: number;
	workspaceId: null | number;
}

/** Full dashboard representation including all child widgets. */
interface DashboardWithWidgets extends DashboardConfig {
	widgets: DashboardWidget[];
}

/** Input payload for creating or updating a widget on a dashboard. */
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

/** Portable JSON format for importing/exporting dashboards between instances. */
interface DashboardExport {
	name: string;
	version: 1;
	widgets: WidgetInput[];
}

/** Metadata for a built-in dashboard template. */
interface DashboardTemplate {
	id: string;
	name: string;
	widgetCount: number;
}

interface ShareResult {
	shareExpiresAt: string;
	shareToken: string;
}

/* -------------------------------------------------------------------------- */
/*  API functions                                                             */
/* -------------------------------------------------------------------------- */

/** Fetch all dashboards belonging to the current user. */
function listDashboards(): Promise<DataResponse<DashboardConfig[]>> {
	return apiClient.get('/dashboards');
}

/** Fetch a single dashboard with all its widget definitions. */
function getDashboard(id: number): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.get(`/dashboards/${id}`);
}

/** Create a new dashboard, optionally with initial widgets. */
function createDashboard(input: {
	name: string;
	widgets?: WidgetInput[];
}): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.post('/dashboards', { body: input });
}

/** Update dashboard name and/or replace all widgets. */
function updateDashboard(
	id: number,
	input: { name: string; widgets?: WidgetInput[] }
): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.put(`/dashboards/${id}`, { body: input });
}

/** Delete a dashboard and all its widgets (cascade). */
function deleteDashboard(id: number): Promise<SuccessResponse> {
	return apiClient.delete(`/dashboards/${id}`);
}

/** List available built-in dashboard templates. */
function listTemplates(): Promise<DataResponse<DashboardTemplate[]>> {
	return apiClient.get('/dashboards/templates');
}

/** Create a new dashboard pre-populated with widgets from a built-in template. */
function createFromTemplate(templateId: string): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.post('/dashboards/from-template', { body: { templateId } });
}

/** Generate a share token for a dashboard. Requires ADMIN+ role. */
function shareDashboard(id: number, expiresInDays?: number): Promise<DataResponse<ShareResult>> {
	return apiClient.post(`/dashboards/${id}/share`, {
		body: expiresInDays ? { expiresInDays } : {},
	});
}

/** Fetch a publicly shared dashboard by its share token (no auth required). */
function getSharedDashboard(token: string): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.get(`/dashboards/shared/${token}`);
}

/** Export a dashboard as a portable JSON payload. */
function exportDashboard(id: number): Promise<DataResponse<DashboardExport>> {
	return apiClient.get(`/dashboards/${id}/export`);
}

/** Import a dashboard from a previously exported JSON payload. */
function importDashboard(data: DashboardExport): Promise<DataResponse<DashboardWithWidgets>> {
	return apiClient.post('/dashboards/import', { body: data });
}

export {
	createDashboard,
	createFromTemplate,
	deleteDashboard,
	exportDashboard,
	getDashboard,
	getSharedDashboard,
	importDashboard,
	listDashboards,
	listTemplates,
	shareDashboard,
	updateDashboard,
};
export type {
	DashboardConfig,
	DashboardExport,
	DashboardTemplate,
	DashboardWidget,
	DashboardWithWidgets,
	MetricType,
	WidgetInput,
	WidgetType,
};
