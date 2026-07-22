import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../constants/pagination.ts';
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
import {
	bulkDeleteNotificationsDocs,
	createNotificationDocs,
	deleteNotificationDocs,
	getNotificationDocs,
	listNotificationsDocs,
} from './crud.docs.ts';

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
			detail: listNotificationsDocs,
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
			detail: getNotificationDocs,
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
			detail: createNotificationDocs,
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
			detail: deleteNotificationDocs,
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
			detail: bulkDeleteNotificationsDocs,
		}
	);

export { notificationCrudRoutes };
