#!/usr/bin/env bun
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { apiKeys } from '../backend/src/db/schema/apiKeys.ts';
import { mfaSettings } from '../backend/src/db/schema/mfaSettings.ts';
import { oauthAccounts } from '../backend/src/db/schema/oauthAccounts.ts';
import { settings } from '../backend/src/db/schema/settings.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { rotateFieldEncryption } from '../backend/src/services/fieldEncryptionRotationService.ts';
import { decrypt, encrypt } from '../backend/src/utils/encryption.ts';

const OLD_KEY = '10'.repeat(32);
const NEW_KEY = '20'.repeat(32);
const plaintexts = [
	'smtp-pass',
	'oauth-client-secret',
	'generic-setting',
	'access-token',
	'refresh-token',
	'totp-secret',
	'backup-codes',
	'api-secret',
];
const failures: string[] = [];
const assert = (condition: boolean, message: string): void => {
	if (!condition) failures.push(message);
};

async function encryptedFixtures(): Promise<string[]> {
	return Promise.all(plaintexts.map((value) => encrypt(value)));
}

function required(values: readonly string[], index: number): string {
	const value = values[index];
	if (value === undefined) throw new Error(`Missing fixture value at index ${index}`);
	return value;
}

async function run(): Promise<void> {
	initializeConfig();
	const security = getConfig().security;
	security.encryptionKey = OLD_KEY;
	delete security.encryptionKeyPrevious;
	const tmp = mkdtempSync(join(tmpdir(), 'spernakit-field-rotation-'));
	const databasePath = join(tmp, 'rotation.db');
	runAutoMigrations(databasePath, resolve('backend', 'drizzle'));
	initializeDatabase(databasePath);

	const encrypted = await encryptedFixtures();
	const setting = required(encrypted, 0);
	const access = required(encrypted, 3);
	const refresh = required(encrypted, 4);
	const mfaSecret = required(encrypted, 5);
	const backupCodes = required(encrypted, 6);
	const apiSecret = required(encrypted, 7);
	const now = new Date();
	getDb()
		.insert(users)
		.values({
			email: 'rotate@example.com',
			passwordHash: 'x',
			role: 'SYSOP',
			username: 'rotate',
		})
		.run();
	getDb()
		.insert(settings)
		.values({
			isEncrypted: true,
			key: 'smtp_config',
			// The real smtpConfigService shape: plaintext JSON, only the nested password encrypted.
			value: JSON.stringify({
				host: 'smtp.example.com',
				password: setting,
				port: 587,
				username: 'mailer',
			}),
		})
		.run();
	getDb()
		.insert(settings)
		.values({
			isEncrypted: true,
			key: 'oauth.github',
			// The real oauthProviderSettingsService shape: nested clientSecret alone encrypted.
			value: JSON.stringify({
				callbackUrlOverride: null,
				clientId: 'github-client-id',
				clientSecret: required(encrypted, 1),
				enabled: true,
			}),
		})
		.run();
	getDb()
		.insert(settings)
		.values({ isEncrypted: true, key: 'session.secret', value: required(encrypted, 2) })
		.run();
	// A hybrid row with nothing to rotate: an empty clientSecret must not count as a rewritten
	// field (settings.key is unique, so the smtp case is covered by the same empty-string path).
	getDb()
		.insert(settings)
		.values({
			isEncrypted: true,
			key: 'oauth.google',
			value: JSON.stringify({
				callbackUrlOverride: null,
				clientId: 'google-client-id',
				clientSecret: '',
				enabled: false,
			}),
		})
		.run();
	getDb()
		.insert(oauthAccounts)
		.values({
			accessTokenEncrypted: access,
			provider: 'github',
			providerAccountId: 'rotation-account',
			refreshTokenEncrypted: refresh,
			userId: 1,
		})
		.run();
	getDb()
		.insert(mfaSettings)
		.values({
			backupCodesEncrypted: backupCodes,
			createdAt: now,
			secretEncrypted: mfaSecret,
			updatedAt: now,
			userId: 1,
		})
		.run();
	getDb()
		.insert(apiKeys)
		.values({
			createdAt: now,
			createdBy: 1,
			keyHash: 'hash',
			keyIndexHash: 'index-hash',
			keyName: 'rotation key',
			keyScope: 'read',
			keySecret: apiSecret,
			updatedAt: now,
		})
		.run();

	security.encryptionKey = NEW_KEY;
	security.encryptionKeyPrevious = OLD_KEY;
	assert(
		(await decrypt(required(encrypted, 0))) === required(plaintexts, 0),
		'previous-key fallback did not decrypt old data',
	);
	const result = await rotateFieldEncryption({ current: NEW_KEY, previous: OLD_KEY });
	assert(result.processed === 8, `expected eight rotated fields, got ${result.processed}`);
	delete security.encryptionKeyPrevious;

	const settingsRows = getDb().select().from(settings).all();
	const byKey = new Map(settingsRows.map((row) => [row.key, row]));

	const smtpRow = byKey.get('smtp_config');
	assert(smtpRow !== undefined, 'smtp_config row disappeared');
	if (smtpRow?.value) {
		const smtpJson = JSON.parse(smtpRow.value) as Record<string, unknown>;
		assert(smtpJson.host === 'smtp.example.com', 'smtp host changed during rotation');
		assert(smtpJson.port === 587, 'smtp port changed during rotation');
		assert(smtpJson.username === 'mailer', 'smtp username changed during rotation');
		assert(
			typeof smtpJson.password === 'string' &&
				(await decrypt(smtpJson.password)) === required(plaintexts, 0),
			'smtp nested password did not rotate to the new key',
		);
	}

	const oauthRow = byKey.get('oauth.github');
	assert(oauthRow !== undefined, 'oauth.github row disappeared');
	if (oauthRow?.value) {
		const oauthJson = JSON.parse(oauthRow.value) as Record<string, unknown>;
		assert(oauthJson.clientId === 'github-client-id', 'oauth clientId changed during rotation');
		assert(oauthJson.enabled === true, 'oauth enabled changed during rotation');
		assert(
			typeof oauthJson.clientSecret === 'string' &&
				(await decrypt(oauthJson.clientSecret)) === required(plaintexts, 1),
			'oauth nested clientSecret did not rotate to the new key',
		);
	}

	const genericRow = byKey.get('session.secret');
	assert(
		genericRow?.value !== undefined &&
			genericRow?.value !== null &&
			(await decrypt(genericRow.value)) === required(plaintexts, 2),
		'whole-value settings row did not rotate to the new key',
	);

	const emptyOauthRow = byKey.get('oauth.google');
	assert(emptyOauthRow !== undefined, 'empty-secret oauth.google row disappeared');
	if (emptyOauthRow?.value) {
		const parsed = JSON.parse(emptyOauthRow.value) as Record<string, unknown>;
		assert(
			parsed.clientSecret === '',
			'empty clientSecret must stay empty, not gain ciphertext',
		);
		assert(
			parsed.clientId === 'google-client-id',
			'empty-secret row body changed during rotation',
		);
	}

	const rotated = [
		getDb().select().from(oauthAccounts).get()?.accessTokenEncrypted,
		getDb().select().from(oauthAccounts).get()?.refreshTokenEncrypted,
		getDb().select().from(mfaSettings).get()?.secretEncrypted,
		getDb().select().from(mfaSettings).get()?.backupCodesEncrypted,
		getDb().select().from(apiKeys).get()?.keySecret,
	];
	for (const [offset, ciphertext] of rotated.entries()) {
		assert(
			ciphertext !== undefined && ciphertext !== null,
			`rotated field ${offset} disappeared`,
		);
		if (ciphertext) {
			assert(
				(await decrypt(ciphertext)) === required(plaintexts, offset + 3),
				`field ${offset} changed`,
			);
		}
	}

	const stableCiphertext = rotated[4];
	getDb().update(settings).set({ value: 'corrupt' }).run();
	security.encryptionKeyPrevious = OLD_KEY;
	let rejected = false;
	try {
		await rotateFieldEncryption({ current: NEW_KEY, previous: OLD_KEY });
	} catch {
		rejected = true;
	}
	assert(rejected, 'a corrupt field must abort rotation');
	assert(
		getDb().select().from(apiKeys).get()?.keySecret === stableCiphertext,
		'a failed rotation partially modified another field',
	);

	await closeDatabase();
	try {
		rmSync(tmp, { force: true, recursive: true });
	} catch {
		// Windows can briefly retain the SQLite WAL handle; temp cleanup is best-effort.
	}
	if (failures.length > 0) {
		console.error('[FAIL] field-encryption-rotation');
		for (const failure of failures) console.error(` - ${failure}`);
		process.exit(1);
	}
	console.log(
		'[OK] every encrypted database field rotates atomically with previous-key fallback',
	);
}

run().catch((error: unknown) => {
	console.error('Fatal field-encryption rotation regression:', error);
	process.exit(1);
});
