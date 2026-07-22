import { OAUTH_PROVIDERS, type OAuthProvider } from 'spernakit-shared';

import { logger } from '../../utils/logger.ts';
import { getByKeyRaw } from '../settingsService.ts';

/**
 * Legacy alias preserved so existing backend call sites
 * (routes/settings/oauth-providers.ts, services/oauthService.ts re-export)
 * keep compiling. New code should import `OAuthProvider` from `spernakit-shared`.
 */
export type OAuthProviderName = OAuthProvider;

export const OAUTH_PROVIDER_NAMES: readonly OAuthProviderName[] = OAUTH_PROVIDERS;

/**
 * Internal, secret-bearing provider settings as stored in the settings table.
 * Named "Internal" to avoid collision with the frontend's OAuthProviderSettings
 * type, which only carries clientSecretLast4 — never the full secret.
 */
export interface OAuthProviderSettingsInternal {
	callbackUrlOverride: null | string;
	clientId: string;
	clientSecret: string;
	enabled: boolean;
}

export interface OAuthProviderSettingsResponseInternal {
	callbackUrlOverride: null | string;
	clientId: string;
	clientSecretLast4: null | string;
	enabled: boolean;
	provider: OAuthProviderName;
}

export function settingsKey(provider: OAuthProviderName): string {
	return `oauth.${provider}`;
}

export interface StoredSettingsRow {
	isEncrypted: boolean;
	settings: OAuthProviderSettingsInternal;
}

/**
 * Read the stored OAuth provider row once, returning both the parsed
 * settings and the isEncrypted flag so callers do not need a second fetch.
 * @param provider - OAuth provider name
 * @returns Parsed settings + isEncrypted flag, or null if no row / unparseable
 */
export function readStoredSettings(provider: OAuthProviderName): null | StoredSettingsRow {
	const row = getByKeyRaw(settingsKey(provider));
	if (!row?.value) return null;

	try {
		return {
			isEncrypted: Boolean(row.isEncrypted),
			settings: JSON.parse(row.value) as OAuthProviderSettingsInternal,
		};
	} catch (err) {
		logger.warn(
			{ err, provider, source: 'readStoredSettings' },
			'Failed to parse OAuth provider settings row - provider will be treated as unconfigured'
		);
		return null;
	}
}

/**
 * Get the stored OAuth provider settings from the settings table.
 * Returns null if no settings are stored for this provider.
 * @param provider - OAuth provider name
 * @returns Stored settings or null
 */
export function getStoredSettings(
	provider: OAuthProviderName
): null | OAuthProviderSettingsInternal {
	return readStoredSettings(provider)?.settings ?? null;
}
