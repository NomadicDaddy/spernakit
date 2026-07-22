import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listApiKeysDocs = {
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
};

const createApiKeyDocs = {
	description:
		'Generates a new API key for a user. Users can create their own API ' +
		'keys. ADMIN role can create for any user. The API key and secret are ' +
		'returned only once - store them securely. Use the secret to sign requests ' +
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
};

const revokeApiKeyDocs = {
	description:
		'Revokes (deactivates) an API key by ID. Users can revoke their own API ' +
		'keys. ADMIN role can revoke any API key. This is a soft delete - ' +
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
};

export { createApiKeyDocs, listApiKeysDocs, revokeApiKeyDocs };
