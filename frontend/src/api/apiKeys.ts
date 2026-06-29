import type {
	ApiKey,
	ApiKeyCreateResponse,
	ApiKeyScope,
	DataResponse,
	SuccessResponse,
} from './types';

import { apiClient } from './client';

interface GenerateApiKeyInput {
	expiresAt?: string;
	keyName: string;
	scope?: ApiKeyScope;
}

/**
 * List all API keys for a user.
 *
 * @returns Array of API keys (without secrets)
 */
function listApiKeys(userId: number): Promise<DataResponse<ApiKey[]>> {
	return apiClient.get<DataResponse<ApiKey[]>>(`/users/${userId}/api-keys`);
}

/**
 * Generate a new API key for a user.
 * The key and secret are returned only once — store them securely.
 *
 * @returns Created API key data with plaintext key and secret
 */
function generateApiKey(
	userId: number,
	input: GenerateApiKeyInput
): Promise<DataResponse<ApiKeyCreateResponse>> {
	return apiClient.post<DataResponse<ApiKeyCreateResponse>>(`/users/${userId}/api-keys`, {
		body: input,
	});
}

/**
 * Revoke (deactivate) an API key.
 *
 * @returns Success response
 */
function revokeApiKey(userId: number, keyId: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/users/${userId}/api-keys/${keyId}`);
}

export { generateApiKey, listApiKeys, revokeApiKey };
