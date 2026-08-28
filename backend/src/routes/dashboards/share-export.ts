import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DATE_RANGE_DEFAULT_DAYS, DATE_RANGE_MAX_DAYS } from '../../constants/validation.ts';
import { assertUser } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	DashboardSharingDisabledError,
	exportDashboard,
	getDashboardShareState,
	revokeDashboardShare,
	shareDashboard,
} from '../../services/dashboardService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { forbiddenError, internalError, notFoundError } from '../../utils/errorResponse.ts';
import { guardDashboardsEnabled } from './schemas.ts';
import {
	exportDashboardDocs,
	getShareStateDocs,
	revokeShareDocs,
	shareDashboardDocs,
} from './share-export.docs.ts';

const idParams = t.Object({
	id: t.Numeric({ minimum: 1 }),
});

const dashboardShareExportRoutes = new Elysia({
	detail: { tags: ['Dashboards'] },
	prefix: '/dashboards',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.onBeforeHandle(guardDashboardsEnabled)
	/* ------------------------------------------------------------------ */
	/*  POST /dashboards/:id/share — generate share link (ADMIN+)         */
	/* ------------------------------------------------------------------ */
	.post(
		'/:id/share',
		({ body, params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			try {
				const result = shareDashboard(
					Number(params.id),
					authUser.id,
					body?.expiresInDays,
					workspaceId,
				);
				if (!result) {
					set.status = HTTP_STATUS.NOT_FOUND;
					return notFoundError('Dashboard');
				}
				return dataResponse(result);
			} catch (err) {
				if (err instanceof DashboardSharingDisabledError) {
					set.status = HTTP_STATUS.FORBIDDEN;
					return forbiddenError(err.message);
				}
				set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
				return internalError();
			}
		},
		{
			body: t.Optional(
				t.Object({
					expiresInDays: t.Optional(
						t.Integer({
							default: DATE_RANGE_DEFAULT_DAYS,
							maximum: DATE_RANGE_MAX_DAYS,
							minimum: 1,
						}),
					),
				}),
			),
			detail: shareDashboardDocs,
			params: idParams,
			requireRole: 'ADMIN',
		},
	)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/:id/share — current share state (ADMIN+)          */
	/* ------------------------------------------------------------------ */
	.get(
		'/:id/share',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const state = getDashboardShareState(Number(params.id), authUser.id, workspaceId);
			if (!state) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(state);
		},
		{
			detail: getShareStateDocs,
			params: idParams,
			requireRole: 'ADMIN',
		},
	)
	/* ------------------------------------------------------------------ */
	/*  DELETE /dashboards/:id/share — revoke share link (ADMIN+)         */
	/* ------------------------------------------------------------------ */
	.delete(
		'/:id/share',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const state = revokeDashboardShare(Number(params.id), authUser.id, workspaceId);
			if (!state) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(state);
		},
		{
			detail: revokeShareDocs,
			params: idParams,
			requireRole: 'ADMIN',
		},
	)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/:id/export — export dashboard as JSON              */
	/* ------------------------------------------------------------------ */
	.get(
		'/:id/export',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const exported = exportDashboard(Number(params.id), authUser.id, workspaceId);
			if (!exported) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(exported);
		},
		{
			detail: exportDashboardDocs,
			params: idParams,
			requireAuth: true,
		},
	);

export { dashboardShareExportRoutes };
