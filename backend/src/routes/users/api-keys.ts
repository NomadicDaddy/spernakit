import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../../plugins/auth.ts';
import type { ApiKeyScope } from '../../types/apiKeys.ts';
import type { UserRole } from '../../types/roles.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, hasMinimumRole, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { ApiKeyScopeSchema } from '../../schemas/domain.ts';
import {
	countActiveApiKeysForUser,
	type CreateApiKeyInput,
	generateApiKey,
	hasActiveApiKeyWithName,
	listApiKeys,
	revokeApiKey,
} from '../../services/apiKeyService.ts';
import { getUserById } from '../../services/userService.ts';
import { ROLE_HIERARCHY } from '../../types/roles.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { conflictError, forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

/**
 * Authorize cross-user API key access. Returns the requester's fresh role on success,
 * or an error response if the requester lacks permission.
 */
function authorizeApiKeyAccess({
	action,
	authUser,
	set,
	targetId,
}: {
	action: string;
	authUser: ReturnType<typeof assertUser>;
	set: { status?: number | string };
	targetId: number;
}): { error: true; response: ReturnType<typeof forbiddenError> } | { freshRole: UserRole } {
	const freshUser = getUserById(authUser.id);
	const freshRole = (freshUser?.role ?? authUser.role) as UserRole;
	if (!hasMinimumRole(freshRole, 'ADMIN')) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return {
			error: true,
			response: forbiddenError(`Cannot ${action} API keys for other users`),
		};
	}

	const targetUser = getUserById(targetId);
	if (targetUser && (ROLE_HIERARCHY[targetUser.role] ?? 0) >= (ROLE_HIERARCHY[freshRole] ?? 0)) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return {
			error: true,
			response: forbiddenError('Cannot manage API keys for users with equal or higher role'),
		};
	}

	return { freshRole };
}

async function handleCreateApiKey({
	body,
	params,
	set,
	user,
}: {
	body: { expiresAt?: string; keyName: string; scope?: ApiKeyScope };
	params: { id: number };
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const targetId = Number(params.id);

	let freshRole: UserRole;
	if (targetId !== authUser.id) {
		const auth = authorizeApiKeyAccess({ action: 'create', authUser, set, targetId });
		if ('error' in auth) return auth.response;
		freshRole = auth.freshRole;
	} else {
		const freshUser = getUserById(authUser.id);
		freshRole = (freshUser?.role ?? authUser.role) as UserRole;
	}

	const scope = body.scope ?? 'read';
	const scopeLevels: Record<ApiKeyScope, number> = {
		admin: 4,
		read: 1,
		write: 2,
	};
	const requesterLevel = ROLE_HIERARCHY[freshRole] ?? 0;
	if (scopeLevels[scope] > requesterLevel) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Cannot create API key with scope higher than your role');
	}

	// The key authenticates AS the target user (createdBy: targetId), so cap the
	// scope by the TARGET's role too — no write/admin-scope keys for a VIEWER.
	const targetUser = getUserById(targetId);
	const targetLevel = ROLE_HIERARCHY[(targetUser?.role ?? 'VIEWER') as UserRole] ?? 0;
	if (scopeLevels[scope] > targetLevel) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError("Cannot create API key with scope above the target user's role");
	}

	const input: CreateApiKeyInput = {
		createdBy: targetId,
		expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
		keyName: body.keyName,
		keyScope: scope,
	};

	// Check for duplicate active key name for the same user
	const duplicate = await hasActiveApiKeyWithName({
		keyName: body.keyName,
		userId: targetId,
	});
	if (duplicate) {
		set.status = HTTP_STATUS.CONFLICT;
		return conflictError('An API key with this name already exists');
	}

	// Enforce per-user cap so the read-side `.limit()` in listApiKeys is
	// guaranteed by the write path; bound is configured by apiKeys.maxPerUser.
	const maxPerUser = getConfig().apiKeys.maxPerUser;
	const activeCount = countActiveApiKeysForUser(targetId);
	if (activeCount >= maxPerUser) {
		set.status = HTTP_STATUS.CONFLICT;
		return conflictError(`API key limit reached (max ${maxPerUser})`);
	}

	const result = await generateApiKey(input);
	set.status = HTTP_STATUS.CREATED;
	return dataResponse({
		apiKey: result.apiKey,
		apiKeySecret: result.apiKeySecret,
		keyData: result.keyData,
	});
}

const usersApiKeysRoutes = new Elysia({
	detail: { tags: ['Users'] },
	prefix: '/users',
})
	.use(authPlugin)
	.get(
		'/:id/api-keys',
		async ({ params, set, user }) => {
			setCacheHeaders(set, 'NO_CACHE');
			const authUser = assertUser(user);
			const targetId = Number(params.id);

			if (targetId !== authUser.id) {
				const auth = authorizeApiKeyAccess({ action: 'view', authUser, set, targetId });
				if ('error' in auth) return auth.response;
			}

			const keys = await listApiKeys({ userId: targetId });
			return dataResponse(keys);
		},
		{
			beforeHandle: requireRoleFresh('VIEWER'),
			detail: {
				description:
					'Returns all API keys for a user. Users can view their own API keys. ' +
					'ADMIN role can view all users API keys. Returns array of API key ' +
					'data (without the actual key or hash).',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('API keys list', [
										{
											createdAt: new Date('2026-02-04'),
											createdBy: 1,
											expiresAt: null,
											id: 1,
											isActive: true,
											keyName: 'Production API Key',
											keyScope: 'read',
											lastUsedAt: new Date('2026-02-04'),
										},
									]),
								},
							},
						},
						description: 'API keys retrieved successfully.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'List API keys for a user',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post('/:id/api-keys', handleCreateApiKey, {
		beforeHandle: requireRoleFresh('VIEWER'),
		body: t.Object({
			expiresAt: t.Optional(t.String({ format: 'date-time' })),
			keyName: t.String({ maxLength: 100, minLength: 1 }),
			scope: t.Optional(ApiKeyScopeSchema),
		}),
		detail: {
			description:
				'Generates a new API key for a user. Users can create their own API ' +
				'keys. ADMIN role can create for any user. The API key and secret are ' +
				'returned only once — store them securely. Use the secret to sign requests ' +
				'with HMAC-SHA256. Default scope is "read". Cannot create API key with ' +
				'scope higher than your role level.',
			responses: {
				'201': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('API key created', {
									apiKey: 'a1b2c3d4e5f6...',
									apiKeySecret: 'x9y8z7w6v5u4t3s2...',
									keyData: {
										createdAt: new Date('2026-02-04'),
										createdBy: 1,
										expiresAt: null,
										id: 1,
										isActive: true,
										keyName: 'My API Key',
										keyScope: 'read',
										lastUsedAt: null,
									},
								}),
							},
						},
					},
					description: 'API key created successfully.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
			},
			summary: 'Generate API key for a user',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.delete(
		'/:id/api-keys/:keyId',
		async ({ params, set, user }) => {
			const authUser = assertUser(user);
			const targetId = Number(params.id);

			if (targetId !== authUser.id) {
				const auth = authorizeApiKeyAccess({ action: 'revoke', authUser, set, targetId });
				if ('error' in auth) return auth.response;
			}

			const keyId = Number(params.keyId);
			const revoked = await revokeApiKey(keyId, targetId);
			if (!revoked) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('API key');
			}
			return successResponse();
		},
		{
			beforeHandle: requireRoleFresh('VIEWER'),
			detail: {
				description:
					'Revokes (deactivates) an API key by ID. Users can revoke their own API ' +
					'keys. ADMIN role can revoke any API key. This is a soft delete — ' +
					'API key is marked as inactive and can no longer be used for authentication.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'API key revoked successfully.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': { description: 'API key not found' },
				},
				summary: 'Revoke API key by ID',
			},
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
				keyId: t.Numeric({ minimum: 1 }),
			}),
		}
	);

export { usersApiKeysRoutes };
