import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../plugins/auth.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../constants/pagination.ts';
import {
	FORBIDDEN_EXAMPLE,
	missingWorkspaceHeaderExample,
	paginatedExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import { assertUser } from '../guards/role.ts';
import { requireSelectedWorkspaceAccess } from '../guards/workspaceAccess.ts';
import { authPlugin } from '../plugins/auth.ts';
import { workspacePlugin } from '../plugins/workspace.ts';
import { limitParam, pageParam } from '../schemas/pagination.ts';
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
		outcome?: 'failed' | 'succeeded';
		page?: number;
		search?: string;
		sortBy?: string;
		sortDir?: string;
		userId?: number;
	};
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	// Kept for its throw, not its value: the handler reads no account of its own any more, but a
	// request that reached here without one is a wiring fault rather than an empty listing.
	assertUser(user);
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

	// The listing follows the header, whoever sent it; only its absence opens the cross-workspace
	// view, and requireSelectedWorkspaceAccess has already decided who may ask for one. See
	// backend/src/guards/workspaceHeader.ts.
	const result = query({
		limit: params.limit ?? DEFAULT_PAGE_LIMIT,
		page: params.page ?? DEFAULT_PAGE,
		...(params.action ? { action: params.action } : {}),
		...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
		...(params.dateTo ? { dateTo: params.dateTo } : {}),
		...(params.outcome ? { outcome: params.outcome } : {}),
		...(params.search ? { search: params.search } : {}),
		/*
		 * Passed through unvalidated on purpose: the service owns the allowlist, and validating
		 * here as well would mean two lists of sortable columns that can disagree. An unknown key
		 * is not an error — see `resolveSort` — so rejecting it at the edge would turn a stale
		 * bookmark into a 400 the reader cannot act on.
		 */
		...(params.sortBy ? { sortBy: params.sortBy } : {}),
		...(params.sortDir ? { sortDir: params.sortDir } : {}),
		...(params.userId ? { userId: params.userId } : {}),
		...(workspaceId ? { workspaceId } : {}),
	});

	const fields = validateFields(parseFields(params.fields), AUDIT_LIST_FIELDS);
	return paginatedResponse(result, projectFields(result.data, fields));
}

const auditRoutes = new Elysia({ detail: { tags: ['Audit'] }, prefix: '/audit-logs' })
	.use(authPlugin)
	.use(workspacePlugin)
	.get('/', handleListAuditLogs, {
		beforeHandle: ({ set, user, workspaceId }) =>
			requireSelectedWorkspaceAccess({ set, user, workspaceId }),
		detail: {
			description:
				'Returns a paginated list of audit log entries. Supports filtering by action ' +
				'type (e.g., user.login, workspace.create), userId, date range (dateFrom/dateTo ' +
				'in ISO 8601), and free-text search. Filter by outcome (`failed` for entries whose ' +
				'response was 400 or above, `succeeded` for the rest) to ask the log whether anyone ' +
				'has been failing to get in; every entry carries `status` (the response status, null ' +
				'when the request succeeded) and `submittedUsername` (the username the request body ' +
				'carried, which is the attempted account on a failed sign-in). ' +
				'Sortable by createdAt, username, action, ' +
				'resource or ipAddress via sortBy/sortDir; an unrecognised sortBy falls back to ' +
				'createdAt descending. Date range is validated - dateTo must be ' +
				'after dateFrom. Scoped to the workspace named by the X-Workspace-ID header; a ' +
				'SYSOP may leave the header off to read across every workspace, and for anyone ' +
				'else a request that names no workspace is answered 400. ' +
				'Use the optional `fields` parameter to request only specific fields ' +
				'(e.g. `fields=id,action,userId,createdAt`). Rows written during a SYSOP impersonation ' +
				'session carry `impersonatedBy`/`impersonatorUsername` naming the real operator; `userId` ' +
				'is the account the request ran as. ' +
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
											action: 'POST /api/v1/auth/login',
											createdAt: '2026-01-15T14:35:00Z',
											details: '{"entity":{"username":"admin"},"status":401}',
											id: 151,
											impersonatedBy: null,
											impersonatorUsername: null,
											ip: '203.0.113.7',
											status: 401,
											submittedUsername: 'admin',
											userId: null,
											username: null,
											workspaceId: null,
										},
										{
											action: 'user.login',
											createdAt: '2026-01-15T14:30:00Z',
											details: null,
											id: 150,
											impersonatedBy: null,
											impersonatorUsername: null,
											ip: '192.168.1.10',
											status: null,
											submittedUsername: null,
											userId: 1,
											username: 'admin',
											workspaceId: 1,
										},
										{
											action: 'workspace.create',
											createdAt: '2026-01-15T12:00:00Z',
											details: '{"name":"Production"}',
											id: 149,
											impersonatedBy: null,
											impersonatorUsername: null,
											ip: '192.168.1.10',
											status: null,
											submittedUsername: null,
											userId: 1,
											username: 'admin',
											workspaceId: null,
										},
										{
											action: 'setting.update',
											createdAt: '2026-01-15T10:15:00Z',
											details: '{"key":"app.name"}',
											id: 148,
											impersonatedBy: 1,
											impersonatorUsername: 'admin',
											ip: '192.168.1.25',
											status: null,
											submittedUsername: null,
											userId: 2,
											username: 'operator1',
											workspaceId: 1,
										},
									],
									42,
									1,
									20,
								),
							},
						},
					},
					description: 'Paginated audit log entries.',
				},
				'400': missingWorkspaceHeaderExample(
					'Invalid dateFrom format. Use ISO 8601 (e.g. 2026-01-01T00:00:00Z)',
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
				}),
			),
			limit: limitParam(),
			outcome: t.Optional(
				t.Union([t.Literal('failed'), t.Literal('succeeded')], {
					description:
						'`failed` returns entries whose response was 400 or above, `succeeded` the rest.',
				}),
			),
			page: pageParam(),
			search: t.Optional(t.String({ maxLength: 255 })),
			sortBy: t.Optional(
				t.String({
					description:
						'Column to sort by: createdAt, username, action, resource, ipAddress. ' +
						'Anything else sorts by createdAt.',
					maxLength: 32,
				}),
			),
			sortDir: t.Optional(
				t.String({
					description: '`asc`, or descending for anything else.',
					maxLength: 4,
				}),
			),
			userId: t.Optional(t.Numeric({ minimum: 1 })),
		}),
		requireRole: 'ADMIN',
	});

export { auditRoutes };
