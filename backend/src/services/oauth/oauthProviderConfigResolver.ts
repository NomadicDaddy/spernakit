import type { OAuthProviderConfig } from './oauthTypes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { decrypt } from '../../utils/encryption.ts';
import { logger } from '../../utils/logger.ts';
import {
	type OAuthProviderName,
	readStoredSettings,
	type StoredSettingsRow,
} from './oauthProviderSettingsStore.ts';

function buildLiveProviderConfig(
	clientId: string,
	clientSecret: string,
	callbackUrl: string,
	tenantId: string | undefined
): OAuthProviderConfig {
	return {
		callbackUrl,
		clientId,
		clientSecret,
		enabled: true,
		...(tenantId !== undefined && { tenantId }),
	};
}

async function resolveStoredProviderConfig(
	stored: StoredSettingsRow,
	fallbackCallbackUrl: string,
	tenantId: string | undefined,
	provider: OAuthProviderName
): Promise<null | OAuthProviderConfig> {
	let clientSecret = stored.settings.clientSecret;
	if (stored.isEncrypted && clientSecret) {
		try {
			clientSecret = await decrypt(clientSecret);
		} catch (err) {
			logger.error(
				{ err, provider },
				'OAuth provider clientSecret decryption failed - provider unavailable'
			);
			return null;
		}
	}

	const clientId = stored.settings.clientId;
	const callbackUrlOverride = stored.settings.callbackUrlOverride;
	const callbackUrl =
		callbackUrlOverride && callbackUrlOverride.length > 0
			? callbackUrlOverride
			: fallbackCallbackUrl;

	if (!clientId || !clientSecret || !callbackUrl) return null;

	return buildLiveProviderConfig(clientId, clientSecret, callbackUrl, tenantId);
}

function resolveFileProviderConfig(
	fileConfig: ReturnType<typeof getConfig>['oauth'][OAuthProviderName],
	tenantId: string | undefined
): null | OAuthProviderConfig {
	if (
		!fileConfig?.enabled ||
		!fileConfig.clientId ||
		!fileConfig.clientSecret ||
		!fileConfig.callbackUrl
	) {
		return null;
	}

	return buildLiveProviderConfig(
		fileConfig.clientId,
		fileConfig.clientSecret,
		fileConfig.callbackUrl,
		tenantId
	);
}

/**
 * Resolve the live, ready-to-use OAuth provider config.
 *
 * Precedence: DB-stored settings (admin-UI-configurable) win when enabled,
 * otherwise fall back to the file-based config. The returned clientSecret is
 * always plaintext (decrypted when the stored row is encrypted).
 *
 * Returns null when neither source enables the provider, when the DB row is
 * enabled but lacks credentials, or when decryption of a stored secret fails.
 *
 * @param provider - OAuth provider name
 * @returns Live provider config or null
 */
async function resolveLiveProviderConfig(
	provider: OAuthProviderName
): Promise<null | OAuthProviderConfig> {
	const config = getConfig();
	const fileConfig = config.oauth[provider];
	const tenantId =
		provider === 'microsoft' ? config.oauth.microsoft.tenantId || 'common' : undefined;
	const stored = readStoredSettings(provider);

	if (stored?.settings.enabled) {
		return resolveStoredProviderConfig(
			stored,
			fileConfig?.callbackUrl ?? '',
			tenantId,
			provider
		);
	}

	return resolveFileProviderConfig(fileConfig, tenantId);
}

export { resolveLiveProviderConfig };
