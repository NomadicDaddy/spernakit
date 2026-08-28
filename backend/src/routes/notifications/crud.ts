import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../../constants/pagination.ts';
import { assertUser, isSysop } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import { NotificationReadStatusSchema, NotificationTypeSchema } from '../../schemas/domain.ts';
import { limitParam, pageParam } from '../../schemas/pagination.ts';
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
				// The service owns the sortable-column allowlist; see the note in routes/audit.ts.
				...(query.sortBy ? { sortBy: query.sortBy } : {}),
				...(query.sortDir ? { sortDir: query.sortDir } : {}),
				...(query.type ? { type: query.type } : {}),
				userId: authUser.id,
				...(!userIsSysop && workspaceId ? { workspaceId } : {}),
			});

			const fields = validateFields(parseFields(query.fields), NOTIFICATION_LIST_FIELDS);
			return paginatedResponse(result, projectFields(result.data, fields));
		},
		{
			detail: listNotificationsDocs,
			query: t.Object({
				fields: t.Optional(
					t.String({
						description: 'Comma-separated list of fields to return',
						maxLength: 255,
					}),
				),
				limit: limitParam(),
				page: pageParam(),
				readStatus: t.Optional(NotificationReadStatusSchema),
				sortBy: t.Optional(
					t.String({
						description:
							'Column to sort by: createdAt, readAt, title, type. Anything else ' +
							'sorts by createdAt.',
						maxLength: 32,
					}),
				),
				sortDir: t.Optional(
					t.String({
						description: '`asc`, or descending for anything else.',
						maxLength: 4,
					}),
				),
				type: t.Optional(NotificationTypeSchema),
			}),
			requireAuth: true,
		},
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
			detail: getNotificationDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
			requireAuth: true,
		},
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
			body: t.Object({
				message: t.String({ maxLength: 1000, minLength: 1 }),
				metadata: t.Optional(
					t.Record(
						t.String({ maxLength: 100 }),
						t.Union([t.String({ maxLength: 500 }), t.Number(), t.Boolean()]),
					),
				),
				title: t.String({ maxLength: 255, minLength: 1 }),
				type: t.Optional(NotificationTypeSchema),
			}),
			detail: createNotificationDocs,
			requireAuth: true,
		},
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
			detail: deleteNotificationDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
			requireAuth: true,
		},
	)
	.post(
		'/bulk-delete',
		({ body, user }) => {
			const authUser = assertUser(user);
			const count = bulkDelete(body.ids, authUser.id);
			return dataResponse({ count });
		},
		{
			body: t.Object({
				ids: t.Array(t.Number({ minimum: 1 }), { maxItems: 100, minItems: 1 }),
			}),
			detail: bulkDeleteNotificationsDocs,
			requireAuth: true,
		},
	);

export { notificationCrudRoutes };
