import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	createFromTemplate,
	getSharedDashboard,
	listTemplates,
} from '../../services/dashboardService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import {
	badRequestError,
	extractErrorMessage,
	notFoundError,
	RATE_ERROR_CODES,
	rateLimitError,
} from '../../utils/errorResponse.ts';
import { guardDashboardsEnabled, widgetSchema } from './schemas.ts';
import {
	checkSharedRateLimit,
	handleImportDashboard,
	validateDashboardWriteWorkspace,
} from './templates-import.helpers.ts';

const dashboardTemplatesRoutes = new Elysia({
	detail: { tags: ['Dashboards'] },
	prefix: '/dashboards',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.onBeforeHandle(guardDashboardsEnabled)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/templates — list available templates               */
	/* ------------------------------------------------------------------ */
	.get(
		'/templates',
		() => {
			return dataResponse(listTemplates());
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns list of available dashboard templates that can be used ' +
					'to quickly create pre-configured dashboards.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Dashboard templates', [
										{
											id: 'system_overview',
											name: 'System Overview',
											widgetCount: 7,
										},
										{
											id: 'api_performance',
											name: 'API Performance',
											widgetCount: 6,
										},
									]),
								},
							},
						},
						description: 'Available dashboard templates.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'List dashboard templates',
			},
		}
	)
	/* ------------------------------------------------------------------ */
	/*  GET /dashboards/shared/:token — view shared dashboard              */
	/* ------------------------------------------------------------------ */
	.get(
		'/shared/:token',
		({ params, set }) => {
			const dashboard = getSharedDashboard(params.token);
			if (!dashboard) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Dashboard');
			}
			return dataResponse(dashboard);
		},
		{
			beforeHandle: ({ request, set }) => {
				const result = checkSharedRateLimit(request);
				if (result.limited) {
					set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
					set.headers['Retry-After'] = String(result.retryAfter ?? 0);
					return rateLimitError(
						result.retryAfter ?? 0,
						RATE_ERROR_CODES.RATE_API_LIMIT_EXCEEDED
					);
				}
				return undefined;
			},
			detail: {
				description:
					'View a shared dashboard by its share token. Does not require authentication. ' +
					'Returns full dashboard with widgets if token is valid and not expired.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Shared dashboard', {
										id: 1,
										name: 'Shared System Dashboard',
										widgets: [],
									}),
								},
							},
						},
						description: 'Shared dashboard with widgets.',
					},
					'404': notFoundExample('Dashboard'),
				},
				summary: 'View shared dashboard',
			},
			params: t.Object({
				token: t.String({ maxLength: 500, minLength: 1 }),
			}),
		}
	)
	/* ------------------------------------------------------------------ */
	/*  POST /dashboards/from-template — create from template              */
	/* ------------------------------------------------------------------ */
	.post(
		'/from-template',
		({ body, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			const workspaceGuard = validateDashboardWriteWorkspace({
				set,
				user: authUser,
				workspaceId,
			});
			if (workspaceGuard) return workspaceGuard;

			try {
				const dashboard = createFromTemplate(authUser.id, body.templateId, workspaceId);
				if (!dashboard) {
					set.status = HTTP_STATUS.NOT_FOUND;
					return notFoundError('Template');
				}
				set.status = HTTP_STATUS.CREATED;
				return dataResponse(dashboard);
			} catch (err) {
				set.status = HTTP_STATUS.BAD_REQUEST;
				return badRequestError(
					extractErrorMessage(err, 'Failed to create dashboard from template')
				);
			}
		},
		{
			beforeHandle: requireRoleFresh('OPERATOR'),
			body: t.Object({
				templateId: t.String({ maxLength: 100, minLength: 1 }),
			}),
			detail: {
				description:
					'Create a new dashboard from a pre-built template. Templates provide ' +
					'pre-configured widget layouts for common monitoring scenarios.',
				responses: {
					'201': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Created from template', {
										id: 2,
										name: 'System Overview',
										widgets: [],
									}),
								},
							},
						},
						description: 'Dashboard created from template.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'404': notFoundExample('Template'),
				},
				summary: 'Create dashboard from template',
			},
		}
	)
	/* ------------------------------------------------------------------ */
	/*  POST /dashboards/import — import dashboard from JSON               */
	/* ------------------------------------------------------------------ */
	.post('/import', handleImportDashboard, {
		beforeHandle: requireRoleFresh('OPERATOR'),
		body: t.Object({
			name: t.String({ maxLength: 100, minLength: 1 }),
			version: t.Integer({ minimum: 1 }),
			widgets: t.Array(widgetSchema),
		}),
		detail: {
			description:
				'Import a dashboard from a previously exported JSON structure. ' +
				'Validates the schema before creating the dashboard.',
			responses: {
				'201': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('Imported dashboard', {
									id: 3,
									name: 'Imported Dashboard',
									widgets: [],
								}),
							},
						},
					},
					description: 'Dashboard imported successfully.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
			},
			summary: 'Import dashboard',
		},
	});

export { dashboardTemplatesRoutes };
