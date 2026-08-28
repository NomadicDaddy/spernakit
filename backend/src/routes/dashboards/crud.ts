import type { Static } from '@sinclair/typebox';

import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { WidgetInput } from '../../services/dashboardService.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, isSysop } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	createDashboard,
	deleteDashboard,
	getDashboard,
	listDashboards,
	updateDashboard,
} from '../../services/dashboardService.ts';
import { broadcastCrudToUser } from '../../services/websocketService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { badRequestError, extractErrorMessage, notFoundError } from '../../utils/errorResponse.ts';
import {
	createDashboardDocs,
	deleteDashboardDocs,
	getDashboardDocs,
	listDashboardsDocs,
	updateDashboardDocs,
} from './crud.docs.ts';
import { guardDashboardsEnabled, widgetSchema } from './schemas.ts';

/**
 * Convert TypeBox-validated widget objects to the service-layer WidgetInput type.
 * TypeBox validates structural compatibility at runtime; the parameter type
 * uses TypeBox's Static inference to maintain type safety at the boundary.
 */
function toWidgetInputs(widgets: Static<typeof widgetSchema>[]): WidgetInput[] {
	return widgets.map((w) => ({
		col: w.col,
		height: w.height,
		metricType: w.metricType,
		...(w.options !== undefined ? { options: w.options } : {}),
		...(w.refreshInterval !== undefined ? { refreshInterval: w.refreshInterval } : {}),
		row: w.row,
		...(w.timeRange !== undefined ? { timeRange: w.timeRange } : {}),
		title: w.title,
		widgetType: w.widgetType,
		width: w.width,
	}));
}

function validateDashboardWriteWorkspace({
	set,
	user,
	workspaceId,
}: {
	set: { status?: number | string };
	user: Parameters<typeof isSysop>[0];
	workspaceId: null | number;
}): object | undefined {
	if (isSysop(user) && workspaceId === null) {
		return undefined;
	}
	return requireWorkspaceAccess({ set, user, workspaceId });
}

const dashboardCrudRoutes = new Elysia({
	detail: { tags: ['Dashboards'] },
	prefix: '/dashboards',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.onBeforeHandle(guardDashboardsEnabled)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards — list user's dashboards                          */
	/* ------------------------------------------------------------------ */
	.get(
		'/',
		({ user, workspaceId }) => {
			const authUser = assertUser(user);
			return dataResponse(listDashboards(authUser.id, workspaceId));
		},
		{
			detail: listDashboardsDocs,
			requireAuth: true,
		},
	)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/:id — get dashboard with widgets                   */
	/* ------------------------------------------------------------------ */
	.get(
		'/:id',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const dashboard = getDashboard(Number(params.id), authUser.id, workspaceId);
			if (!dashboard) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(dashboard);
		},
		{
			detail: getDashboardDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireAuth: true,
		},
	)
	/* ------------------------------------------------------------------ */
	/*  POST /dashboards — create dashboard                                */
	/* ------------------------------------------------------------------ */
	.post(
		'/',
		({ body, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const workspaceGuard = validateDashboardWriteWorkspace({
				set,
				user: authUser,
				workspaceId,
			});
			if (workspaceGuard) return workspaceGuard;

			try {
				const dashboard = createDashboard(authUser.id, {
					name: body.name,
					...(body.widgets ? { widgets: toWidgetInputs(body.widgets) } : {}),
					workspaceId,
				});
				broadcastCrudToUser(authUser.id, WS_CRUD_EVENTS.DASHBOARD_CREATED, {
					id: dashboard.id,
				});
				set.status = HTTP_STATUS.CREATED;
				return dataResponse(dashboard);
			} catch (err) {
				set.status = HTTP_STATUS.BAD_REQUEST;
				return badRequestError(extractErrorMessage(err, 'Failed to create dashboard'));
			}
		},
		{
			body: t.Object({
				name: t.String({ maxLength: 100, minLength: 1 }),
				widgets: t.Optional(t.Array(widgetSchema)),
			}),
			detail: createDashboardDocs,
			requireRole: 'OPERATOR',
		},
	)
	/* ------------------------------------------------------------------ */
	/*  PUT /dashboards/:id — update dashboard                             */
	/* ------------------------------------------------------------------ */
	.put(
		'/:id',
		({ body, params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const dashboard = updateDashboard(
				Number(params.id),
				authUser.id,
				{
					name: body.name,
					...(body.widgets ? { widgets: toWidgetInputs(body.widgets) } : {}),
				},
				workspaceId,
			);
			if (!dashboard) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			broadcastCrudToUser(authUser.id, WS_CRUD_EVENTS.DASHBOARD_UPDATED, {
				id: dashboard.id,
			});
			return dataResponse(dashboard);
		},
		{
			body: t.Object({
				name: t.String({ maxLength: 100, minLength: 1 }),
				widgets: t.Optional(t.Array(widgetSchema)),
			}),
			detail: updateDashboardDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireRole: 'OPERATOR',
		},
	)
	/* ------------------------------------------------------------------ */
	/*  DELETE /dashboards/:id — delete dashboard                          */
	/* ------------------------------------------------------------------ */
	.delete(
		'/:id',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const dashboardId = Number(params.id);
			const deleted = deleteDashboard(dashboardId, authUser.id, workspaceId);
			if (!deleted) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			broadcastCrudToUser(authUser.id, WS_CRUD_EVENTS.DASHBOARD_DELETED, { id: dashboardId });
			return successResponse();
		},
		{
			detail: deleteDashboardDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireRole: 'OPERATOR',
		},
	);

export { dashboardCrudRoutes };
