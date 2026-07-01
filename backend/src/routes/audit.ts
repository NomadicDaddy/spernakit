import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../plugins/auth.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants/pagination.ts';
import {
	badRequestExample,
	FORBIDDEN_EXAMPLE,
	paginatedExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import { assertUser, isSysop, requireRoleFresh } from '../guards/role.ts';
import { requireSelectedWorkspaceAccess } from '../guards/workspaceAccess.ts';
import { authPlugin } from '../plugins/auth.ts';
import { workspacePlugin } from '../plugins/workspace.ts';
import { query } from '../services/auditService.ts';
import { paginatedResponse } from '../utils/apiResponse.ts';
import { badRequestError } from '../utils/errorResponse.ts';
import {
	AUDIT_LIST_FIELDS,
	parseFields,
	projectFields,
	validateFields,
} from '../utils/fieldSelection.ts';
import { isValidDateString } from '../utils/validation.ts';

function handleListAuditLogs({
	query: params,
	set,
	user,
	workspaceId,
}: {
	query: {
		action?: string;
		dateFrom?: string;
		dateTo?: string;
		fields?: string;
		limit?: number;
		page?: number;
		search?: string;
		userId?: number;
	};
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const authUser = assertUser(user);
	if (params.dateFrom && !isValidDateString(params.dateFrom)) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Invalid dateFrom format. Use ISO 8601 (e.g. 2026-01-01T00:00:00Z)');
	}
	if (params.dateTo && !isValidDateString(params.dateTo)) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Invalid dateTo format. Use ISO 8601 (e.g. 2026-01-31T23:59:59Z)');
	}
	if (params.dateFrom && params.dateTo) {
		const from = new Date(params.dateFrom);
		const to = new Date(params.dateTo);
		if (to < from) {
			set.status = HTTP_STATUS.BAD_REQUEST;
			return badRequestError('dateTo must be after or equal to dateFrom');
		}
	}

	const userIsSysop = isSysop(authUser);
	const result = query({
		limit: params.limit ?? DEFAULT_PAGE_LIMIT,
		page: params.page ?? DEFAULT_PAGE,
		...(params.action ? { action: params.action } : {}),
		...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
		...(params.dateTo ? { dateTo: params.dateTo } : {}),
		...(params.search ? { search: params.search } : {}),
		...(params.userId ? { userId: params.userId } : {}),
		...(!userIsSysop && workspaceId ? { workspaceId } : {}),
	});

	const fields = validateFields(parseFields(params.fields), AUDIT_LIST_FIELDS);
	return paginatedResponse(result, projectFields(result.data, fields));
}

const auditRoutes = new Elysia({ detail: { tags: ['Audit'] }, prefix: '/audit-logs' })
	.use(authPlugin)
	.use(workspacePlugin)
	.get('/', handleListAuditLogs, {
		beforeHandle: ({ set, user, workspaceId }) => {
			const roleGuard = requireRoleFresh('ADMIN')({ set, user });
			if (roleGuard) return roleGuard;
			return requireSelectedWorkspaceAccess({ set, user, workspaceId });
		},
		detail: {
			description:
				'Returns a paginated list of audit log entries. Supports filtering by action ' +
				'type (e.g., user.login, workspace.create), userId, date range (dateFrom/dateTo ' +
				'in ISO 8601), and free-text search. Date range is validated — dateTo must be ' +
				'after dateFrom. Scoped to workspace via X-Workspace-Id header (SYSOP sees ' +
				'all). Use the optional `fields` parameter to request only specific fields ' +
				'(e.g. `fields=id,action,userId,createdAt`). ' +
				'Returns { data: [...], page, limit, total }. Requires ADMIN role or higher.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: paginatedExample(
									'Audit log entries',
									[
										{
											action: 'user.login',
											createdAt: '2026-01-15T14:30:00Z',
											details: null,
											id: 150,
											ip: '192.168.1.10',
											userId: 1,
											username: 'admin',
											workspaceId: 1,
										},
										{
											action: 'workspace.create',
											createdAt: '2026-01-15T12:00:00Z',
											details: '{"name":"Production"}',
											id: 149,
											ip: '192.168.1.10',
											userId: 1,
											username: 'admin',
											workspaceId: null,
										},
										{
											action: 'setting.update',
											createdAt: '2026-01-15T10:15:00Z',
											details: '{"key":"app.name"}',
											id: 148,
											ip: '192.168.1.25',
											userId: 2,
											username: 'operator1',
											workspaceId: 1,
										},
									],
									42,
									1,
									20
								),
							},
						},
					},
					description: 'Paginated audit log entries.',
				},
				'400': badRequestExample(
					'Invalid dateFrom format. Use ISO 8601 (e.g. 2026-01-01T00:00:00Z)'
				),
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
			},
			summary: 'List audit logs with filters (ADMIN+)',
		},
		query: t.Object({
			action: t.Optional(t.String({ maxLength: 100 })),
			dateFrom: t.Optional(t.String({ maxLength: 50 })),
			dateTo: t.Optional(t.String({ maxLength: 50 })),
			fields: t.Optional(
				t.String({
					description: 'Comma-separated list of fields to return',
					maxLength: 255,
				})
			),
			limit: t.Optional(
				t.Numeric({ default: DEFAULT_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT, minimum: 1 })
			),
			page: t.Optional(t.Numeric({ default: DEFAULT_PAGE, minimum: 1 })),
			search: t.Optional(t.String({ maxLength: 255 })),
			userId: t.Optional(t.Numeric({ minimum: 1 })),
		}),
	});

export { auditRoutes };
