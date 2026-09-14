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
	const access = required(encrypted, 1);
	const refresh = required(encrypted, 2);
	const mfaSecret = required(encrypted, 3);
	const backupCodes = required(encrypted, 4);
	const apiSecret = required(encrypted, 5);
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
		.values({ isEncrypted: true, key: 'smtp.password', value: setting })
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
	assert(result.processed === 6, `expected six rotated fields, got ${result.processed}`);
	delete security.encryptionKeyPrevious;

	const rotated = [
		getDb().select().from(settings).get()?.value,
		getDb().select().from(oauthAccounts).get()?.accessTokenEncrypted,
		getDb().select().from(oauthAccounts).get()?.refreshTokenEncrypted,
		getDb().select().from(mfaSettings).get()?.secretEncrypted,
		getDb().select().from(mfaSettings).get()?.backupCodesEncrypted,
		getDb().select().from(apiKeys).get()?.keySecret,
	];
	for (const [index, ciphertext] of rotated.entries()) {
		assert(
			ciphertext !== undefined && ciphertext !== null,
			`rotated field ${index} disappeared`,
		);
		if (ciphertext) {
			assert(
				(await decrypt(ciphertext)) === required(plaintexts, index),
				`field ${index} changed`,
			);
		}
	}

	const stableCiphertext = rotated[5];
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
