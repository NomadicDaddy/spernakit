import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { DATE_RANGE_DEFAULT_DAYS, DATE_RANGE_MAX_DAYS } from '../../constants/validation.ts';
import { assertUser, isSysop, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	DashboardSharingDisabledError,
	exportDashboard,
	shareDashboard,
} from '../../services/dashboardService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { forbiddenError, internalError, notFoundError } from '../../utils/errorResponse.ts';
import { guardDashboardsEnabled } from './schemas.ts';

/**
 * Resolve workspace scope for share/export endpoints — SYSOPs without an
 * X-Workspace-ID header retain the cross-workspace view, everyone else is
 * scoped to the active workspace.
 */
function resolveDashboardScope(user: { role: string }, workspaceId: null | number): null | number {
	if (isSysop(user as Parameters<typeof isSysop>[0]) && workspaceId === null) {
		return null;
	}
	return workspaceId;
}

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
			const scope = resolveDashboardScope(authUser, workspaceId);
			try {
				const result = shareDashboard(
					Number(params.id),
					authUser.id,
					body?.expiresInDays,
					scope
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
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			body: t.Optional(
				t.Object({
					expiresInDays: t.Optional(
						t.Integer({
							default: DATE_RANGE_DEFAULT_DAYS,
							maximum: DATE_RANGE_MAX_DAYS,
							minimum: 1,
						})
					),
				})
			),
			detail: {
				description:
					'Generate a share token for a dashboard. Shared dashboards are read-only ' +
					'and accessible via the /shared/:token endpoint. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Share token generated', {
										shareExpiresAt: '2026-03-05T10:00:00.000Z',
										shareToken: 'abc123...',
									}),
								},
							},
						},
						description: 'Share token generated.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': notFoundExample('Dashboard'),
				},
				summary: 'Share dashboard (ADMIN+)',
			},
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
		}
	)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/:id/export — export dashboard as JSON              */
	/* ------------------------------------------------------------------ */
	.get(
		'/:id/export',
		({ params, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const scope = resolveDashboardScope(authUser, workspaceId);
			const exported = exportDashboard(Number(params.id), authUser.id, scope);
			if (!exported) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(exported);
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Export a dashboard configuration as a portable JSON structure. ' +
					'The export can be imported into the same or a different instance.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Exported dashboard', {
										name: 'My Dashboard',
										version: 1,
										widgets: [],
									}),
								},
							},
						},
						description: 'Dashboard export data.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'404': notFoundExample('Dashboard'),
				},
				summary: 'Export dashboard',
			},
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
		}
	);

export { dashboardShareExportRoutes };
