import type { SettingRow } from '../settingsService.ts';

import { Type } from '../../config/configSchemaHelpers.ts';
import { decrypt, encrypt } from '../../utils/encryption.ts';
import { logger } from '../../utils/logger.ts';
import { parseSettingsJson } from '../../utils/validation.ts';
import { getByKeyRaw, seedDefault, update } from '../settingsService.ts';

const SMTP_CONFIG_KEY = 'smtp_config';

const SmtpConfigSchema = Type.Object({
	fromAddress: Type.Optional(Type.String()),
	fromName: Type.Optional(Type.String()),
	host: Type.Optional(Type.String()),
	password: Type.Optional(Type.String()),
	port: Type.Optional(Type.Number()),
	secure: Type.Optional(Type.Boolean()),
	user: Type.Optional(Type.String()),
});

interface SmtpConfig {
	fromAddress: string;
	fromName: string;
	host: string;
	password: string;
	port: number;
	secure: boolean;
	user: string;
}

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
	fromAddress: '',
	fromName: '',
	host: '',
	password: '',
	port: 587,
	secure: false,
	user: '',
};

/**
 * Get the default SMTP config.
 * Used for seeding and type reference.
 *
 * @returns A copy of the default SMTP configuration
 */
function getDefaultSmtpConfig(): SmtpConfig {
	return { ...DEFAULT_SMTP_CONFIG };
}

/**
 * Ensure SMTP config exists in database (seed if not).
 * This ensures the database is the single source of truth.
 */
function ensureSmtpConfigSeeded(): void {
	seedDefault(SMTP_CONFIG_KEY, DEFAULT_SMTP_CONFIG, 'SMTP server configuration', false);
}

/** Simple TTL cache for SMTP config. TTL: 5 minutes. */
let cachedSmtpConfig: null | SmtpConfig = null;
let smtpCacheExpiresAt = 0;

async function getSmtpConfig(): Promise<SmtpConfig> {
	if (cachedSmtpConfig && Date.now() < smtpCacheExpiresAt) {
		return cachedSmtpConfig;
	}

	ensureSmtpConfigSeeded();

	const setting = getByKeyRaw(SMTP_CONFIG_KEY);

	if (!setting?.value) {
		return getDefaultSmtpConfig();
	}

	const parsed = parseSettingsJson(
		setting.value,
		SmtpConfigSchema,
		DEFAULT_SMTP_CONFIG,
		'SMTP config'
	);

	let password = parsed.password ?? DEFAULT_SMTP_CONFIG.password;

	if (setting.isEncrypted && password) {
		try {
			password = await decrypt(password);
		} catch (err) {
			logger.error(
				{ err },
				'SMTP password decryption failed - encryption key may have changed. ' +
					'Re-enter SMTP credentials in Settings > Email'
			);
			password = '';
		}
	}

	const config: SmtpConfig = {
		fromAddress: parsed.fromAddress ?? DEFAULT_SMTP_CONFIG.fromAddress,
		fromName: parsed.fromName ?? DEFAULT_SMTP_CONFIG.fromName,
		host: parsed.host ?? DEFAULT_SMTP_CONFIG.host,
		password,
		port: parsed.port ?? DEFAULT_SMTP_CONFIG.port,
		secure: parsed.secure ?? DEFAULT_SMTP_CONFIG.secure,
		user: parsed.user ?? DEFAULT_SMTP_CONFIG.user,
	};

	cachedSmtpConfig = config;
	smtpCacheExpiresAt = Date.now() + 5 * 60_000;
	return config;
}

/**
 * Get the SMTP config with the password masked for API display.
 * Returns '***' if a password is set, empty string if not.
 *
 * @returns SMTP config with password field masked
 */
async function getSmtpConfigMasked(): Promise<SmtpConfig> {
	const config = await getSmtpConfig();
	return { ...config, password: config.password ? '***' : '' };
}

/**
 * Update the SMTP configuration in the database.
 *
 * ## Encryption model (dual-layer masking)
 *
 * The stored JSON blob uses **selective field encryption**: only the `password` field is
 * AES-GCM encrypted via `encrypt()` from `utils/encryption.ts`. Other fields (host, port,
 * user, fromAddress, fromName, secure) remain as plaintext within the JSON because they are
 * non-secret operational parameters — knowing a mail server hostname or port does not
 * constitute a credential leak.
 *
 * Separately, the `isEncrypted` flag on the settings row controls **API-level masking** in
 * `settingsService`: any setting with `isEncrypted: true` has its entire `value` column
 * replaced with `'[encrypted]'` in API responses (`getAll`, `getByKey`, `getByKeys`). This
 * prevents the raw JSON blob (including plaintext host/port/user) from appearing in the
 * generic settings API. The SMTP-specific API uses `getSmtpConfigMasked()` instead, which
 * independently masks the password field with `'***'` after decryption.
 *
 * In summary:
 * - **`isEncrypted: true`** = entire setting value hidden from generic settings API responses
 * - **AES-GCM encryption** = password field only, within the stored JSON blob
 * - **`getSmtpConfigMasked()`** = password masked with `'***'` for SMTP-specific API display
 *
 * @param updates - Partial SMTP config fields to merge with the current configuration
 * @param userId - ID of the user performing the update (for audit trail)
 * @returns The updated settings row from the database
 */
async function updateSmtpConfig(updates: Partial<SmtpConfig>, userId: number): Promise<SettingRow> {
	const current = await getSmtpConfig();

	// If the password is the mask value or empty, keep the existing password
	if (updates.password === '***' || updates.password === '') {
		delete updates.password;
	}

	const merged = { ...current, ...updates };

	let password = merged.password;
	if (password) {
		password = await encrypt(password);
	}

	const configToStore = { ...merged, password };

	cachedSmtpConfig = null;
	smtpCacheExpiresAt = 0;

	return update({
		description: 'SMTP server configuration (host, port, credentials)',
		// Triggers API-level masking: settingsService replaces the entire value with
		// '[encrypted]' in generic API responses. This is independent of the field-level
		// AES-GCM encryption applied to the password above.
		isEncrypted: true,
		key: SMTP_CONFIG_KEY,
		updatedBy: userId,
		value: JSON.stringify(configToStore),
	});
}

export type { SmtpConfig };
export {
	DEFAULT_SMTP_CONFIG,
	ensureSmtpConfigSeeded,
	getSmtpConfig,
	getSmtpConfigMasked,
	SMTP_CONFIG_KEY,
	SmtpConfigSchema,
	updateSmtpConfig,
};
