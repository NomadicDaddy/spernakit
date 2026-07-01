import { OAUTH_PROVIDERS, type OAuthProvider } from 'spernakit-shared';

import type { OAuthProviderConfig } from './oauthTypes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { decrypt, encrypt } from '../../utils/encryption.ts';
import { logger } from '../../utils/logger.ts';
import { getByKeyRaw, update } from '../settingsService.ts';

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

function settingsKey(provider: OAuthProviderName): string {
	return `oauth.${provider}`;
}

interface StoredSettingsRow {
	isEncrypted: boolean;
	settings: OAuthProviderSettingsInternal;
}

/**
 * Read the stored OAuth provider row once, returning both the parsed
 * settings and the isEncrypted flag so callers do not need a second fetch.
 * @param provider - OAuth provider name
 * @returns Parsed settings + isEncrypted flag, or null if no row / unparseable
 */
function readStoredSettings(provider: OAuthProviderName): null | StoredSettingsRow {
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
			'Failed to parse OAuth provider settings row — provider will be treated as unconfigured'
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
function getStoredSettings(provider: OAuthProviderName): null | OAuthProviderSettingsInternal {
	return readStoredSettings(provider)?.settings ?? null;
}

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
			'Failed to decrypt OAuth client secret — last-4 display will be null'
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
				'OAuth provider clientSecret decryption failed — provider unavailable'
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

export {
	getOAuthProviderSettingsAsync,
	isProviderEnabled,
	resolveLiveProviderConfig,
	updateOAuthProviderSettings,
};
