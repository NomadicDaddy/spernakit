import { and, eq, inArray } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';

import { getDb } from '../../db/index.ts';
import { settings } from '../../db/schema/settings.ts';
import { logger } from '../../utils/logger.ts';

interface SettingRow {
	description: null | string;
	isEncrypted: boolean;
	key: string;
	updatedAt: Date;
	updatedBy: null | number;
	value: null | string;
}

/** Placeholder shown in place of encrypted values in API responses. */
const ENCRYPTED_PLACEHOLDER = '[encrypted]';

/** LRU cache for raw setting rows, keyed by setting key. TTL: 5 minutes, max 500 entries. */
const settingsCache = new LRUCache<string, SettingRow>({
	max: 500,
	ttl: 5 * 60 * 1000,
});

/**
 * Get all settings with encrypted values redacted.
 * Settings marked as isEncrypted will have their value replaced with '[encrypted]'.
 *
 * No .limit() applied: the settings table is inherently bounded — it contains only
 * admin-managed configuration key-value pairs (typically dozens of rows). Adding a
 * .limit() would risk silently truncating settings and masking missing configuration.
 *
 * @returns All setting rows with encrypted values masked
 */
function getAll(): SettingRow[] {
	const db = getDb();
	const rows = db.select().from(settings).where(eq(settings.isDeleted, false)).all();
	return rows.map((row) => (row.isEncrypted ? { ...row, value: ENCRYPTED_PLACEHOLDER } : row));
}

/**
 * Get a single setting by key with encrypted values masked.
 * Use getByKeyRaw() for internal services that need the actual encrypted value.
 *
 * @param key - Setting key
 * @returns Setting row with encrypted value masked, or null
 */
function getByKey(key: string): null | SettingRow {
	const row = getByKeyRaw(key);
	if (!row) return null;
	return row.isEncrypted ? { ...row, value: ENCRYPTED_PLACEHOLDER } : row;
}

/**
 * Get a single setting by key with raw (unmasked) value.
 * Only use in internal services that need the actual encrypted value (e.g., SMTP config).
 *
 * @param key - Setting key
 * @returns Setting row with raw value, or null
 */
function getByKeyRaw(key: string): null | SettingRow {
	const cached = settingsCache.get(key);
	if (cached) {
		return cached;
	}

	const db = getDb();
	const row =
		db
			.select()
			.from(settings)
			.where(and(eq(settings.key, key), eq(settings.isDeleted, false)))
			.get() ?? null;

	if (row) {
		settingsCache.set(key, row);
		logger.debug({ key }, 'Settings cache miss, loaded from DB');
	} else {
		logger.debug({ key }, 'Settings key not found');
	}

	return row;
}

/**
 * Get multiple settings by keys in a single query.
 * Encrypted values are masked with the placeholder.
 *
 * @param keys - Setting keys to retrieve
 * @returns Map of key to SettingRow (only includes keys that exist)
 */
function getByKeys(keys: string[]): Map<string, SettingRow> {
	const settingsMap = new Map<string, SettingRow>();
	const missingKeys: string[] = [];

	// Check cache first for each requested key
	for (const key of keys) {
		const cached = settingsCache.get(key);
		if (cached) {
			settingsMap.set(
				key,
				cached.isEncrypted ? { ...cached, value: ENCRYPTED_PLACEHOLDER } : cached
			);
		} else {
			missingKeys.push(key);
		}
	}

	// Only query the database for keys not found in cache
	if (missingKeys.length > 0) {
		const db = getDb();
		const rows = db
			.select()
			.from(settings)
			.where(and(inArray(settings.key, missingKeys), eq(settings.isDeleted, false)))
			.all();

		for (const row of rows) {
			settingsCache.set(row.key, row);
			settingsMap.set(
				row.key,
				row.isEncrypted ? { ...row, value: ENCRYPTED_PLACEHOLDER } : row
			);
		}
	}

	return settingsMap;
}

export { getAll, getByKey, getByKeyRaw, getByKeys, settingsCache };
export type { SettingRow };
