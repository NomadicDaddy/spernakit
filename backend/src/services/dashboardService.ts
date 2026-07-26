/**
 * Dashboard Service — Facade.
 *
 * Re-exports public API from the dashboard/ subdirectory.
 * No business logic belongs in this file.
 */
export {
	createDashboard,
	deleteDashboard,
	getDashboard,
	listDashboards,
	updateDashboard,
} from './dashboard/dashboardCrud.ts';
export { exportDashboard, importDashboard } from './dashboard/dashboardExportService.ts';
export {
	DashboardSharingDisabledError,
	getSharedDashboard,
	shareDashboard,
} from './dashboard/dashboardSharingService.ts';
export { createFromTemplate, listTemplates } from './dashboard/dashboardTemplateService.ts';
export type { DashboardExport, WidgetInput } from './dashboard/dashboardTypes.ts';
