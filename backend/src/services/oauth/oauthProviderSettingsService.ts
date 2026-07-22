import { decrypt, encrypt } from '../../utils/encryption.ts';
import { logger } from '../../utils/logger.ts';
import { update } from '../settingsService.ts';
import {
	getStoredSettings,
	OAUTH_PROVIDER_NAMES,
	type OAuthProviderName,
	type OAuthProviderSettingsInternal,
	type OAuthProviderSettingsResponseInternal,
	readStoredSettings,
	settingsKey,
	type StoredSettingsRow,
} from './oauthProviderSettingsStore.ts';

/**
 * Resolve the last 4 characters of the stored client secret, decrypting if needed.
 * Returns null when there is no secret or decryption fails.
 * @param stored - Stored settings row (or null)
 * @returns Last 4 characters of the decrypted secret, or null
 */
async function resolveClientSecretLast4(stored: null | StoredSettingsRow): Promise<null | string> {
	const secret = stored?.settings.clientSecret;
	if (!secret) return null;

	if (!stored.isEncrypted) {
		return secret.length >= 4 ? secret.slice(-4) : secret;
	}

	try {
		const decrypted = await decrypt(secret);
		return decrypted.length >= 4 ? decrypted.slice(-4) : decrypted;
	} catch (err) {
		logger.warn(
			{ err, source: 'resolveClientSecretLast4' },
			'Failed to decrypt OAuth client secret - last-4 display will be null'
		);
		return null;
	}
}

/**
 * Get all OAuth provider settings, merging DB-stored values with defaults.
 * The clientSecret is never returned — only the last 4 characters.
 * Async to properly decrypt encrypted client secrets for last-4 display.
 * @returns Array of provider settings with decrypted last-4 characters
 */
async function getOAuthProviderSettingsAsync(): Promise<OAuthProviderSettingsResponseInternal[]> {
	return Promise.all(
		OAUTH_PROVIDER_NAMES.map(async (provider) => {
			const stored = readStoredSettings(provider);
			return {
				callbackUrlOverride: stored?.settings.callbackUrlOverride ?? null,
				clientId: stored?.settings.clientId ?? '',
				clientSecretLast4: await resolveClientSecretLast4(stored),
				enabled: stored?.settings.enabled ?? false,
				provider,
			};
		})
	);
}

interface UpdateOAuthProviderPayload {
	callbackUrlOverride?: null | string;
	clientId?: string;
	clientSecret?: string;
	enabled?: boolean;
}

/**
 * Update OAuth provider settings. Encrypts clientSecret before storage.
 * @param provider - OAuth provider name
 * @param payload - Fields to update
 * @param updatedBy - User ID performing the update
 * @returns Promise that resolves when update is complete
 */
async function updateOAuthProviderSettings(
	provider: OAuthProviderName,
	payload: UpdateOAuthProviderPayload,
	updatedBy: number
): Promise<void> {
	const existing = getStoredSettings(provider);

	const clientId = payload.clientId ?? existing?.clientId ?? '';
	let clientSecret = payload.clientSecret ?? existing?.clientSecret ?? '';
	const enabled = payload.enabled ?? existing?.enabled ?? false;
	const callbackUrlOverride =
		payload.callbackUrlOverride !== undefined
			? payload.callbackUrlOverride
			: (existing?.callbackUrlOverride ?? null);

	// Encrypt the clientSecret before storing
	if (clientSecret) {
		clientSecret = await encrypt(clientSecret);
	}

	const settingsValue: OAuthProviderSettingsInternal = {
		callbackUrlOverride,
		clientId,
		clientSecret,
		enabled,
	};

	update({
		description: `OAuth provider configuration for ${provider}`,
		isEncrypted: true,
		key: settingsKey(provider),
		updatedBy,
		value: JSON.stringify(settingsValue),
	});
}

/**
 * Check if a specific provider is enabled in the settings table.
 * Falls back to false if no settings exist.
 * @param provider - OAuth provider name
 * @returns Whether the provider is enabled
 */
function isProviderEnabled(provider: OAuthProviderName): boolean {
	const stored = getStoredSettings(provider);
	return stored?.enabled ?? false;
}

export { resolveLiveProviderConfig } from './oauthProviderConfigResolver.ts';
export { OAUTH_PROVIDER_NAMES } from './oauthProviderSettingsStore.ts';
export type {
	OAuthProviderName,
	OAuthProviderSettingsInternal,
	OAuthProviderSettingsResponseInternal,
} from './oauthProviderSettingsStore.ts';

export { getOAuthProviderSettingsAsync, isProviderEnabled, updateOAuthProviderSettings };
