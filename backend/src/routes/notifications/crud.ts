import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../constants/pagination.ts';
import {
	dataExample,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, isSysop, requireAuth } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import { NotificationReadStatusSchema, NotificationTypeSchema } from '../../schemas/domain.ts';
import {
	bulkDelete,
	create,
	deleteOne,
	getById,
	list,
} from '../../services/notificationService.ts';
import { dataResponse, paginatedResponse, successResponse } from '../../utils/apiResponse.ts';
import { notFoundError } from '../../utils/errorResponse.ts';
import {
	NOTIFICATION_LIST_FIELDS,
	parseFields,
	projectFields,
	validateFields,
} from '../../utils/fieldSelection.ts';

const notificationCrudRoutes = new Elysia({
	detail: { tags: ['Notifications'] },
	prefix: '/notifications',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.get(
		'/',
		({ query, user, workspaceId }) => {
			const authUser = assertUser(user);
			const userIsSysop = isSysop(authUser);
			const result = list({
				limit: query.limit ?? DEFAULT_PAGE_LIMIT,
				page: query.page ?? DEFAULT_PAGE,
				...(query.readStatus ? { readStatus: query.readStatus } : {}),
				...(query.type ? { type: query.type } : {}),
				userId: authUser.id,
				...(!userIsSysop && workspaceId ? { workspaceId } : {}),
			});

			const fields = validateFields(parseFields(query.fields), NOTIFICATION_LIST_FIELDS);
			return paginatedResponse(result, projectFields(result.data, fields));
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns a paginated list of notifications for the authenticated user. ' +
					'Filter by readStatus (all, read, unread) and/or type (info, warning, ' +
					'error, success). Use the optional `fields` parameter to request only ' +
					'specific fields (e.g. `fields=id,title,type,readAt`). ' +
					'Returns { data: [...], page, limit, total }.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Page 1 of notifications', [
										{
											createdAt: '2026-02-03T06:00:00.000Z',
											id: 10,
											isRead: false,
											message: 'Daily backup finished successfully.',
											title: 'Backup completed',
											type: 'success',
										},
										{
											createdAt: '2026-02-02T18:30:00.000Z',
											id: 9,
											isRead: true,
											message: 'Disk usage above 85%.',
											title: 'Disk space warning',
											type: 'warning',
										},
									]),
								},
							},
						},
						description: 'Paginated notification list.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'List notifications with pagination and filters',
			},
			query: t.Object({
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
				readStatus: t.Optional(NotificationReadStatusSchema),
				type: t.Optional(NotificationTypeSchema),
			}),
		}
	)
	.get(
		'/:id',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const notification = getById(Number(params.id), authUser.id);
			if (!notification) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Notification');
			}
			return dataResponse(notification);
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns a single notification by its numeric ID. Only accessible to the ' +
					'user that the notification belongs to. Returns 404 if not found or not owned. ' +
					'This is an API-only endpoint for programmatic consumers (e.g., API-key ' +
					'integrations). The frontend UI uses the list endpoint instead.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Single notification', {
										createdAt: '2026-02-03T06:00:00.000Z',
										id: 10,
										isRead: false,
										message: 'Daily backup finished successfully.',
										title: 'Backup completed',
										type: 'success',
										userId: 1,
									}),
								},
							},
						},
						description: 'Notification details.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'404': notFoundExample('Notification'),
				},
				summary: 'Get notification by ID',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post(
		'/',
		({ body, set, user, workspaceId }) => {
			const authUser = assertUser(user);
			if (workspaceId) {
				const guard = requireWorkspaceAccess({ set, user: authUser, workspaceId });
				if (guard) return guard;
			}
			const notification = create({
				message: body.message,
				metadata: body.metadata ?? null,
				title: body.title,
				type: body.type ?? 'info',
				userId: authUser.id,
				...(workspaceId ? { workspaceId } : {}),
			});
			set.status = HTTP_STATUS.CREATED;
			return dataResponse(notification);
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				message: t.String({ maxLength: 1000, minLength: 1 }),
				metadata: t.Optional(
					t.Record(
						t.String({ maxLength: 100 }),
						t.Union([t.String({ maxLength: 500 }), t.Number(), t.Boolean()])
					)
				),
				title: t.String({ maxLength: 255, minLength: 1 }),
				type: t.Optional(NotificationTypeSchema),
			}),
			detail: {
				description:
					'Creates a new notification for a user. Defaults to the authenticated user ' +
					'if userId is not provided. Type defaults to "info" if not specified (valid: ' +
					'info, warning, error, success). Optionally scoped to a workspace via ' +
					'X-Workspace-Id header. Returns 201 on success. This is an API-only endpoint ' +
					'for programmatic consumers (e.g., scheduled tasks, external integrations via ' +
					'API keys). Notifications are system-generated and not created through the UI.',
				responses: {
					'201': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('New notification', {
										createdAt: '2026-02-03T14:00:00.000Z',
										id: 11,
										isRead: false,
										message: 'Production deployment has been initiated.',
										title: 'Deploy started',
										type: 'info',
										userId: 1,
									}),
								},
							},
						},
						description: 'Notification created.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Create a notification',
			},
		}
	)
	.delete(
		'/:id',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const deleted = deleteOne(Number(params.id), authUser.id);
			if (!deleted) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Notification');
			}
			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Permanently deletes a notification by its ID. Only the notification owner ' +
					'can delete it. Returns 404 if not found or not owned.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'Notification deleted.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'404': notFoundExample('Notification'),
				},
				summary: 'Delete a notification',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post(
		'/bulk-delete',
		({ body, user }) => {
			const authUser = assertUser(user);
			const count = bulkDelete(body.ids, authUser.id);
			return dataResponse({ count });
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				ids: t.Array(t.Number({ minimum: 1 }), { maxItems: 100, minItems: 1 }),
			}),
			detail: {
				description:
					'Deletes multiple notifications in a single request. Pass an array of ' +
					'notification IDs in the body. Only notifications owned by the authenticated ' +
					'user are deleted. Returns { data: { count: number } } with the number removed.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Bulk delete result', { count: 3 }),
								},
							},
						},
						description: 'Bulk delete result.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Bulk delete notifications',
			},
		}
	);

export { notificationCrudRoutes };
