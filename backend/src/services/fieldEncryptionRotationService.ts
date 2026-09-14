import { eq } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { apiKeys } from '../db/schema/apiKeys.ts';
import { mfaSettings } from '../db/schema/mfaSettings.ts';
import { oauthAccounts } from '../db/schema/oauthAccounts.ts';
import { settings } from '../db/schema/settings.ts';
import { decryptWithKeys, encryptWithKey } from '../utils/encryption.ts';
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
		.select({ id: settings.id, value: settings.value })
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
		settingRows.map(async (row) => ({ id: row.id, value: await rotateValue(row.value, keys) })),
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
