import type { OAuthProvider } from 'spernakit-shared';

import { apiClient } from './client';

/**
 * Legacy alias preserved for the frontend barrel re-export and call sites
 * that import `OAuthProviderName` from this module. New code should import
 * `OAuthProvider` from `spernakit-shared`.
 */
type OAuthProviderName = OAuthProvider;

interface OAuthProviderSettings {
	callbackUrlOverride: null | string;
	clientId: string;
	clientSecretLast4: null | string;
	enabled: boolean;
	provider: OAuthProviderName;
}

interface OAuthProviderSettingsResponse {
	providers: OAuthProviderSettings[];
}

interface UpdateOAuthProviderPayload {
	callbackUrlOverride?: null | string;
	clientId?: string;
	clientSecret?: string;
	enabled?: boolean;
}

interface TestOAuthProviderResponse {
	data: {
		error?: string;
		provider: OAuthProviderName;
		reachable: boolean;
		statusCode?: number;
	};
}

function listOAuthProviderSettings(): Promise<OAuthProviderSettingsResponse> {
	return apiClient.get<OAuthProviderSettingsResponse>('/settings/oauth-providers');
}

function updateOAuthProviderSetting(
	provider: OAuthProviderName,
	payload: UpdateOAuthProviderPayload
): Promise<{ success: boolean }> {
	return apiClient.patch<{ success: boolean }>(`/settings/oauth-providers/${provider}`, {
		body: payload,
	});
}

function testOAuthProviderConnection(
	provider: OAuthProviderName
): Promise<TestOAuthProviderResponse> {
	return apiClient.post<TestOAuthProviderResponse>(`/settings/oauth-providers/${provider}/test`, {
		body: {},
	});
}

export { listOAuthProviderSettings, testOAuthProviderConnection, updateOAuthProviderSetting };
export type {
	OAuthProviderSettings,
	OAuthProviderSettingsResponse,
	TestOAuthProviderResponse,
	UpdateOAuthProviderPayload,
};
