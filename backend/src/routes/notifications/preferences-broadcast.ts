import { Elysia, t } from 'elysia';

import { dataExample, UNAUTHORIZED_EXAMPLE } from '../../constants/responseExamples.ts';
import { assertUser, isSysop, requireAuth } from '../../guards/role.ts';
import { requireSelectedWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	getPreferences,
	getStatistics,
	getUnreadCount,
	updatePreferences,
} from '../../services/notificationService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';

const notificationPreferencesRoutes = new Elysia({
	detail: { tags: ['Notifications'] },
	prefix: '/notifications',
})
	.use(authPlugin)
	.use(workspacePlugin)
	.get(
		'/statistics',
		({ user, workspaceId }) => {
			const authUser = assertUser(user);
			const userIsSysop = isSysop(authUser);
			return dataResponse(
				getStatistics(authUser.id, !userIsSysop && workspaceId ? workspaceId : undefined)
			);
		},
		{
			beforeHandle: ({ set, user, workspaceId }) => {
				const authGuard = requireAuth({ set, user });
				if (authGuard) return authGuard;
				return requireSelectedWorkspaceAccess({ set, user, workspaceId });
			},
			detail: {
				description:
					'Returns aggregate notification statistics for the user, including total ' +
					'count, unread count, and counts by type. Scoped to current workspace via ' +
					'X-Workspace-Id header (SYSOP sees all).',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Notification stats', {
										byType: {
											error: 3,
											info: 20,
											success: 9,
											warning: 10,
										},
										total: 42,
										unread: 5,
									}),
								},
							},
						},
						description: 'Notification statistics.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get notification statistics',
			},
		}
	)
	.get(
		'/unread-count',
		({ user, workspaceId }) => {
			const authUser = assertUser(user);
			const userIsSysop = isSysop(authUser);
			return dataResponse({
				count: getUnreadCount(
					authUser.id,
					!userIsSysop && workspaceId ? workspaceId : undefined
				),
			});
		},
		{
			beforeHandle: ({ set, user, workspaceId }) => {
				const authGuard = requireAuth({ set, user });
				if (authGuard) return authGuard;
				return requireSelectedWorkspaceAccess({ set, user, workspaceId });
			},
			detail: {
				description:
					'Returns the count of unread notifications for the authenticated user. ' +
					'Returns { data: { count: number } }. Scoped to current workspace via ' +
					'X-Workspace-Id header (SYSOP sees all).',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Unread count', { count: 5 }),
								},
							},
						},
						description: 'Unread count.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get unread notification count',
			},
		}
	)
	.get(
		'/preferences',
		({ user }) => {
			const authUser = assertUser(user);
			return dataResponse(getPreferences(authUser.id));
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns notification preferences for the authenticated user, including ' +
					'toggles for email, push, system alerts, and marketing emails.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('User preferences', {
										emailNotifications: true,
										marketingEmails: false,
										pushNotifications: false,
										securityAlerts: true,
										systemAlerts: true,
									}),
								},
							},
						},
						description: 'Notification preferences.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get notification preferences',
			},
		}
	)
	.put(
		'/preferences',
		({ body, user }) => {
			const authUser = assertUser(user);
			const preferences = updatePreferences(authUser.id, {
				emailNotifications: body.emailNotifications,
				marketingEmails: body.marketingEmails,
				pushNotifications: body.pushNotifications,
				securityAlerts: body.securityAlerts,
				systemAlerts: body.systemAlerts,
			});
			return dataResponse(preferences);
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				emailNotifications: t.Boolean(),
				marketingEmails: t.Boolean(),
				pushNotifications: t.Boolean(),
				securityAlerts: t.Boolean(),
				systemAlerts: t.Boolean(),
			}),
			detail: {
				description:
					'Updates all notification preference toggles for the authenticated user. ' +
					'All fields are required (full replacement). Toggles: emailNotifications, ' +
					'pushNotifications, systemAlerts, securityAlerts, marketingEmails.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Updated preferences', {
										emailNotifications: true,
										marketingEmails: false,
										pushNotifications: true,
										securityAlerts: true,
										systemAlerts: true,
									}),
								},
							},
						},
						description: 'Preferences updated.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Update notification preferences',
			},
		}
	);

export { notificationPreferencesRoutes };
