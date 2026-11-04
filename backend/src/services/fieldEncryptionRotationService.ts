import { eq } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { apiKeys } from '../db/schema/apiKeys.ts';
import { mfaSettings } from '../db/schema/mfaSettings.ts';
import { oauthAccounts } from '../db/schema/oauthAccounts.ts';
import { settings } from '../db/schema/settings.ts';
import { decryptWithKeys, encryptWithKey } from '../utils/encryption.ts';
import { OAUTH_PROVIDER_NAMES, settingsKey } from './oauth/oauthProviderSettingsStore.ts';
import { settingsCache } from './settings/settingsQueries.ts';

interface RotationKeys {
	current: string;
	previous: string;
}

interface RotationResult {
	processed: number;
}

async function rotateValue(value: null | string, keys: RotationKeys): Promise<null | string> {
	if (value === null || value === '') return value;
	const plaintext = await decryptWithKeys(value, [keys.current, keys.previous]);
	return encryptWithKey(plaintext, keys.current);
}

/**
 * Settings rows stored as plaintext JSON whose single nested field is the ciphertext: the SMTP
 * configuration (nested `password`) and every OAuth provider row (nested `clientSecret`) keep
 * `isEncrypted` set for API masking, so rotation must re-encrypt only the nested field and leave
 * the surrounding JSON untouched. Whole-value rotation on these rows cannot parse the JSON as
 * ciphertext and would abort the entire rotation.
 */
const HYBRID_SECRET_FIELDS: Readonly<Record<string, string>> = {
	smtp_config: 'password',
	...Object.fromEntries(
		OAUTH_PROVIDER_NAMES.map((provider) => [settingsKey(provider), 'clientSecret']),
	),
};

async function rotateHybridValue(
	value: null | string,
	secretField: string,
	keys: RotationKeys,
): Promise<null | string> {
	if (value === null || value === '') return value;
	const parsed: unknown = JSON.parse(value);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`Hybrid settings row is not a JSON object (secret field: ${secretField})`);
	}
	const record = parsed as Record<string, unknown>;
	const secret = record[secretField];
	if (typeof secret !== 'string' || secret === '') return value;
	record[secretField] = await rotateValue(secret, keys);
	return JSON.stringify(record);
}

/**
 * Re-encrypt every field protected by security.encryptionKey in one database transaction.
 *
 * @param keys - Current write key and previous read key
 * @returns Count of non-empty ciphertext fields rewritten
 */
async function rotateFieldEncryption(keys: RotationKeys): Promise<RotationResult> {
	if (keys.current === keys.previous) {
		throw new Error('Current and previous encryption keys must differ');
	}
	const db = getDb();
	const settingRows = db
		.select({ id: settings.id, key: settings.key, value: settings.value })
		.from(settings)
		.where(eq(settings.isEncrypted, true))
		.all();
	const oauthRows = db
		.select({
			access: oauthAccounts.accessTokenEncrypted,
			id: oauthAccounts.id,
			refresh: oauthAccounts.refreshTokenEncrypted,
		})
		.from(oauthAccounts)
		.all();
	const mfaRows = db
		.select({
			backup: mfaSettings.backupCodesEncrypted,
			id: mfaSettings.id,
			secret: mfaSettings.secretEncrypted,
		})
		.from(mfaSettings)
		.all();
	const apiKeyRows = db.select({ id: apiKeys.id, secret: apiKeys.keySecret }).from(apiKeys).all();

	// Finish every decrypt and encrypt before opening the write transaction. Any corrupt row aborts
	// without modifying the database; plaintext exists only in these short-lived local promises.
	const rotatedSettings = await Promise.all(
		settingRows.map(async (row) => {
			const hybridField = HYBRID_SECRET_FIELDS[row.key];
			const value = hybridField
				? await rotateHybridValue(row.value, hybridField, keys)
				: await rotateValue(row.value, keys);
			return { id: row.id, value };
		}),
	);
	const rotatedOauth = await Promise.all(
		oauthRows.map(async (row) => ({
			access: await rotateValue(row.access, keys),
			id: row.id,
			refresh: await rotateValue(row.refresh, keys),
		})),
	);
	const rotatedMfa = await Promise.all(
		mfaRows.map(async (row) => ({
			backup: await rotateValue(row.backup, keys),
			id: row.id,
			secret: await rotateValue(row.secret, keys),
		})),
	);
	const rotatedApiKeys = await Promise.all(
		apiKeyRows.map(async (row) => ({
			id: row.id,
			secret: await rotateValue(row.secret, keys),
		})),
	);

	db.transaction((tx) => {
		for (const row of rotatedSettings) {
			tx.update(settings).set({ value: row.value }).where(eq(settings.id, row.id)).run();
		}
		for (const row of rotatedOauth) {
			tx.update(oauthAccounts)
				.set({ accessTokenEncrypted: row.access, refreshTokenEncrypted: row.refresh })
				.where(eq(oauthAccounts.id, row.id))
				.run();
		}
		for (const row of rotatedMfa) {
			tx.update(mfaSettings)
				.set({ backupCodesEncrypted: row.backup, secretEncrypted: row.secret ?? '' })
				.where(eq(mfaSettings.id, row.id))
				.run();
		}
		for (const row of rotatedApiKeys) {
			tx.update(apiKeys).set({ keySecret: row.secret }).where(eq(apiKeys.id, row.id)).run();
		}
	});
	settingsCache.clear();
	const processed =
		rotatedSettings.filter((row) => row.value).length +
		rotatedOauth.flatMap((row) => [row.access, row.refresh]).filter(Boolean).length +
		rotatedMfa.flatMap((row) => [row.secret, row.backup]).filter(Boolean).length +
		rotatedApiKeys.filter((row) => row.secret).length;
	return { processed };
}

export { rotateFieldEncryption };
export type { RotationKeys, RotationResult };
