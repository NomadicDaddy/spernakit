import { and, eq } from 'drizzle-orm';

import type { SettingRow } from './settingsQueries.ts';

import { getDb } from '../../db/index.ts';
import { settings } from '../../db/schema/settings.ts';
import { getByKeyRaw, getByKeys, settingsCache } from './settingsQueries.ts';

interface UpdateSettingOptions {
	description?: string | undefined;
	isEncrypted?: boolean | undefined;
	key: string;
	updatedBy: null | number;
	value: string;
}

/**
 * Upsert a setting. Creates if not found, updates if exists.
 *
 * @param options - Setting update options
 * @param options.description
 * @param options.isEncrypted
 * @param options.key
 * @param options.updatedBy
 * @param options.value
 * @returns The updated or created setting row
 */
function update({
	description,
	isEncrypted = false,
	key,
	updatedBy,
	value,
}: UpdateSettingOptions): SettingRow {
	const db = getDb();
	const now = new Date();

	db.insert(settings)
		.values({
			createdBy: updatedBy,
			description: description ?? null,
			isEncrypted,
			key,
			updatedAt: now,
			updatedBy,
			value,
		})
		.onConflictDoUpdate({
			set: {
				isDeleted: false,
				isEncrypted,
				updatedAt: now,
				updatedBy,
				value,
				...(description !== undefined ? { description } : {}),
			},
			target: settings.key,
		})
		.run();

	settingsCache.delete(key);

	const result = db
		.select()
		.from(settings)
		.where(and(eq(settings.key, key), eq(settings.isDeleted, false)))
		.get();

	if (!result) {
		throw new Error(`Failed to retrieve setting '${key}' after upsert operation`);
	}

	return result;
}

/**
 * Seed a default value for a setting if it doesn't exist.
 * This ensures the database is the single source of truth.
 *
 * @param key - Setting key
 * @param defaultValue - Default value to seed (will be JSON stringified)
 * @param description - Optional description
 * @param isEncrypted - Optional flag to mark value as encrypted
 * @returns True if seeded, false if already exists
 */
function seedDefault(
	key: string,
	defaultValue: unknown,
	description?: string,
	isEncrypted = false
): boolean {
	const existing = getByKeyRaw(key);
	if (existing) {
		return false;
	}

	const db = getDb();
	db.insert(settings)
		.values({
			description: description ?? null,
			isEncrypted,
			key,
			value: JSON.stringify(defaultValue),
		})
		.run();

	return true;
}

interface SeedDefaultEntry {
	description?: string;
	isEncrypted?: boolean;
	key: string;
	value: unknown;
}

/**
 * Seed multiple default settings in bulk. Uses a single query to check which keys
 * already exist, then inserts only the missing ones. Much more efficient than
 * calling seedDefault() in a loop (1 query instead of N).
 *
 * @param defaults - Array of setting defaults to seed
 * @returns Number of settings that were seeded
 */
function seedDefaults(defaults: SeedDefaultEntry[]): number {
	if (defaults.length === 0) return 0;

	const keys = defaults.map((d) => d.key);
	const existing = getByKeys(keys);

	const missing = defaults.filter((d) => !existing.has(d.key));
	if (missing.length === 0) return 0;

	const db = getDb();
	db.transaction((tx) => {
		for (const { description, isEncrypted, key, value } of missing) {
			tx.insert(settings)
				.values({
					description: description ?? null,
					isEncrypted: isEncrypted ?? false,
					key,
					value: JSON.stringify(value),
				})
				.run();
		}
	});
	return missing.length;
}

export { seedDefault, seedDefaults, update };
export type { SeedDefaultEntry };
