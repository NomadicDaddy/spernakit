import { Elysia, t } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, isSysop, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { requireSelectedWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import { NotificationTypeSchema, UserRoleSchema } from '../../schemas/domain.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { escapeHtml } from '../../services/emailService.ts';
import { broadcast, markAllAsRead, markAsRead } from '../../services/notificationService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { notFoundError } from '../../utils/errorResponse.ts';

const notificationBroadcastRoutes = new Elysia({
	detail: { tags: ['Notifications'] },
	prefix: '/notifications',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.get(
		'/retention-policy',
		() => {
			// Expose only the notification retention window — the runtime source of
			// truth read by the cleanup scheduler (config.retention.notificationsDays).
			// Every other config value is intentionally redacted from this response.
			const config = getConfig();
			return dataResponse({ deletedNotificationsDays: config.retention.notificationsDays });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns the effective notification retention policy used by the cleanup ' +
					'scheduler. `deletedNotificationsDays` is the number of days a soft-deleted ' +
					'notification is retained before it is permanently purged, read live from ' +
					'config.retention.notificationsDays. Read-only; all other configuration values ' +
					'are redacted. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Notification retention policy', {
										deletedNotificationsDays: 30,
									}),
								},
							},
						},
						description: 'Effective notification retention policy.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get notification retention policy (ADMIN+)',
			},
		}
	)
	.post(
		'/broadcast',
		({ body, user }) => {
			const authUser = assertUser(user);
			const count = broadcast({
				createdBy: authUser.id,
				message: escapeHtml(body.message),
				...(body.roleFilter ? { roleFilter: body.roleFilter } : {}),
				title: escapeHtml(body.title),
				type: body.type ?? 'info',
			});
			logAudit({
				action: 'NOTIFICATION_BROADCAST',
				details: {
					count,
					...(body.roleFilter ? { roleFilter: body.roleFilter } : {}),
					title: body.title,
					type: body.type ?? 'info',
				},
				entityType: 'notification',
				userId: authUser.id,
			});
			return dataResponse({ count });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			body: t.Object({
				message: t.String({ maxLength: 1000, minLength: 1 }),
				roleFilter: t.Optional(UserRoleSchema),
				title: t.String({ maxLength: 255, minLength: 1 }),
				type: t.Optional(NotificationTypeSchema),
			}),
			detail: {
				description:
					'Sends a notification to all users, optionally filtered by role. Returns ' +
					'{ data: { count: number } } with the number of users notified. Type ' +
					'defaults to "info". Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Broadcast result', { count: 12 }),
								},
							},
						},
						description: 'Broadcast sent.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Broadcast notification to users (ADMIN+)',
			},
		}
	)
	.put(
		'/:id/read',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const marked = markAsRead(Number(params.id), authUser.id);
			if (!marked) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Notification');
			}
			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Marks a single notification as read by its ID. Only the notification owner ' +
					'can mark it. Returns 404 if not found or not owned. Idempotent — marking ' +
					'an already-read notification succeeds silently.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'Notification marked as read.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'404': notFoundExample('Notification'),
				},
				summary: 'Mark notification as read',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.put(
		'/read-all',
		({ user, workspaceId }) => {
			const authUser = assertUser(user);
			const count = isSysop(authUser)
				? markAllAsRead(authUser.id)
				: markAllAsRead(authUser.id, workspaceId);
			return dataResponse({ count });
		},
		{
			beforeHandle: ({ set, user, workspaceId }) => {
				const authGuard = requireAuth({ set, user });
				if (authGuard) return authGuard;
				return requireSelectedWorkspaceAccess({ set, user, workspaceId });
			},
			detail: {
				description:
					'Marks all unread notifications as read for the authenticated user. Returns ' +
					'{ data: { count: number } } with the number of notifications marked.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Mark all result', { count: 5 }),
								},
							},
						},
						description: 'All notifications marked as read.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Mark all notifications as read',
			},
		}
	);

export { notificationBroadcastRoutes };
