import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, isSysop, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { getAll, getByKey, update } from '../../services/settingsService.ts';
import { broadcastCrudToAdmins } from '../../services/websocketService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

/** Key prefixes that require SYSOP role to create or modify. */
const RESTRICTED_KEY_PREFIXES = ['auth.', 'security.', 'smtp.', 'oauth.', 'encryption.'];

const settingsGeneralRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/',
		({ set, user }) => {
			const authUser = assertUser(user);
			// Mutable — no cache
			setCacheHeaders(set, 'NO_CACHE');
			// Same restriction as the per-key endpoint: security-sensitive keys
			// are only visible to SYSOP, so omit them from the bulk listing too.
			const rows = isSysop(authUser)
				? getAll()
				: getAll().filter(
						(row) =>
							!RESTRICTED_KEY_PREFIXES.some((prefix) => row.key.startsWith(prefix))
					);
			return dataResponse(rows);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns all application settings as key-value pairs. Each setting includes ' +
					'key, value, description, and updatedBy/updatedAt metadata. Security-sensitive ' +
					'keys (auth.*, security.*, smtp.*, oauth.*, encryption.*) are omitted for ' +
					'non-SYSOP callers. ' +
					'Not HTTP-cached (derived from mutable settings). Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Application settings', [
										{
											description: 'Display name for application',
											key: 'app.name',
											updatedAt: '2026-01-10T08:00:00Z',
											updatedBy: 1,
											value: 'My Application',
										},
										{
											description: 'Default timezone for date display',
											key: 'app.timezone',
											updatedAt: '2026-01-10T08:00:00Z',
											updatedBy: 1,
											value: 'America/New_York',
										},
									]),
								},
							},
						},
						description: 'All application settings.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'List all settings (ADMIN+)',
			},
		}
	)
	// API-only: No frontend caller (bulk GET covers UI needs). Available for API-key consumers.
	.get(
		'/:key',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			if (
				RESTRICTED_KEY_PREFIXES.some((prefix) => params.key.startsWith(prefix)) &&
				!isSysop(authUser)
			) {
				set.status = HTTP_STATUS.FORBIDDEN;
				return forbiddenError('Only SYSOP can read security-sensitive settings');
			}
			const setting = getByKey(params.key);
			if (!setting) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Setting');
			}
			// Mutable — no cache
			setCacheHeaders(set, 'NO_CACHE');
			return dataResponse(setting);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns a single setting by its key string. Security-sensitive keys ' +
					'(auth.*, security.*, smtp.*, oauth.*, encryption.*) require SYSOP role. ' +
					'Returns 404 if the key does not exist. Not HTTP-cached. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Single setting', {
										description: 'Display name for application',
										key: 'app.name',
										updatedAt: '2026-01-10T08:00:00Z',
										updatedBy: 1,
										value: 'My Application',
									}),
								},
							},
						},
						description: 'Setting value and metadata.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': notFoundExample('Setting'),
				},
				summary: 'Get setting by key (ADMIN+, SYSOP for sensitive keys)',
			},
			params: t.Object({
				key: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_.]+$' }),
			}),
		}
	)
	.put(
		'/:key',
		({ body, params, set, user }) => {
			const authUser = assertUser(user);
			if (
				RESTRICTED_KEY_PREFIXES.some((prefix) => params.key.startsWith(prefix)) &&
				!isSysop(authUser)
			) {
				set.status = HTTP_STATUS.FORBIDDEN;
				return forbiddenError('Only SYSOP can modify security-sensitive settings');
			}
			const setting = update({
				description: body.description,
				key: params.key,
				updatedBy: authUser.id,
				value: body.value,
			});
			logAudit({
				action: 'SETTINGS_UPDATE',
				details: { key: params.key, value: body.value },
				entityId: params.key,
				entityType: 'settings',
				userId: authUser.id,
			});
			broadcastCrudToAdmins(WS_CRUD_EVENTS.SETTING_UPDATED, { key: params.key });
			return dataResponse(setting);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			body: t.Object({
				description: t.Optional(t.String({ maxLength: 1000 })),
				value: t.String({ maxLength: 2000, minLength: 1 }),
			}),
			detail: {
				description:
					'Creates or updates a setting identified by the key path parameter. The ' +
					'value is always stored as a string. An optional description can be provided. ' +
					'Tracks which user made the change and when. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Setting after update', {
										description: 'Display name for application',
										key: 'app.name',
										updatedAt: '2026-01-15T14:30:00Z',
										updatedBy: 1,
										value: 'Updated Application Name',
									}),
								},
							},
						},
						description: 'Updated setting.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Update setting by key (ADMIN+)',
			},
			params: t.Object({
				key: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_.]+$' }),
			}),
		}
	);

export { settingsGeneralRoutes };
