import { Elysia, t } from 'elysia';

import { dataExample, UNAUTHORIZED_EXAMPLE } from '../../constants/responseExamples.ts';
import { assertUser, requireAuth } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { getUserUiSettings, updateUserUiSettings } from '../../services/userService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';

const settingsUserRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/user',
		({ set, user }) => {
			setCacheHeaders(set, 'NO_CACHE');
			const authUser = assertUser(user);
			const settings = getUserUiSettings(authUser.id);
			return dataResponse(settings);
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns UI settings for the authenticated user. Settings include theme, ' +
					'appTheme, layoutMode, containerWidth, density, sidebarCollapsed, timezone, ' +
					'dateFormat, timeFormat, and language. Merges user settings with defaults ' +
					'if not set. Requires authentication.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('User UI settings', {
										appTheme: 'default',
										containerWidth: 'centered',
										dateFormat: 'MM/DD/YYYY',
										density: 'comfortable',
										language: 'en',
										layoutMode: 'sidebar',
										sidebarCollapsed: false,
										theme: 'system',
										timeFormat: 'HH:mm',
										timezone: 'America/New_York',
									}),
								},
							},
						},
						description: 'User UI settings.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get user UI settings',
			},
		}
	)
	.put(
		'/user',
		({ body, user }) => {
			const authUser = assertUser(user);
			const settings = updateUserUiSettings(authUser.id, body, authUser.id);
			return dataResponse(settings);
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				appTheme: t.Optional(t.String({ maxLength: 50 })),
				containerWidth: t.Optional(
					t.Union([t.Literal('centered'), t.Literal('full-width')])
				),
				dateFormat: t.Optional(t.String({ maxLength: 50 })),
				density: t.Optional(
					t.Union([t.Literal('compact'), t.Literal('comfortable'), t.Literal('relaxed')])
				),
				language: t.Optional(t.String({ maxLength: 10 })),
				layoutMode: t.Optional(t.Union([t.Literal('sidebar'), t.Literal('topbar')])),
				sidebarCollapsed: t.Optional(t.Boolean()),
				theme: t.Optional(
					t.Union([t.Literal('system'), t.Literal('light'), t.Literal('dark')])
				),
				timeFormat: t.Optional(t.String({ maxLength: 20 })),
				timezone: t.Optional(t.String({ maxLength: 100 })),
			}),
			detail: {
				description:
					'Updates UI settings for the authenticated user. Supports partial updates ' +
					'(only provided fields are updated). Invalid setting names or values are rejected. ' +
					'Changes are logged in audit trail. Requires authentication.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Updated user UI settings', {
										appTheme: 'ocean',
										containerWidth: 'full-width',
										dateFormat: 'DD/MM/YYYY',
										density: 'compact',
										language: 'en',
										layoutMode: 'topbar',
										sidebarCollapsed: true,
										theme: 'dark',
										timeFormat: 'HH:mm:ss',
										timezone: 'Europe/London',
									}),
								},
							},
						},
						description: 'Updated user UI settings.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Update user UI settings',
			},
		}
	);

export { settingsUserRoutes };
