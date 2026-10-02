#!/usr/bin/env bun
/**
 * Regression coverage for the OAuth provider client secret across settings updates.
 *
 * The update merged the request with the stored row and then encrypted whatever secret came out.
 * When the request did not carry a secret, that was the stored ciphertext, so it was encrypted a
 * second time and decrypted afterwards to ciphertext rather than the secret. An admin who toggled
 * `enabled` or changed the callback URL broke the provider without touching its secret.
 *
 * Holds three properties: a supplied secret is stored encrypted and decrypts to itself; an update
 * that does not carry a secret leaves it decrypting to the same value, however many times it is
 * repeated; and an empty secret clears it.
 *
 * Runs in-process against a throwaway temp-file SQLite database, like
 * scripts/test-workspace-role-predicate.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import {
	getOAuthProviderSettingsAsync,
	updateOAuthProviderSettings,
} from '../backend/src/services/oauth/oauthProviderSettingsService.ts';
import {
	OAUTH_PROVIDER_NAMES,
	readStoredSettings,
} from '../backend/src/services/oauth/oauthProviderSettingsStore.ts';
import { decrypt } from '../backend/src/utils/encryption.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'client-secret-value-wxyz';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
	checks += 1;
	if (!condition) failures.push(message);
}

async function storedSecret(provider: (typeof OAUTH_PROVIDER_NAMES)[number]): Promise<string> {
	const stored = readStoredSettings(provider);
	const secret = stored?.settings.clientSecret ?? '';
	return secret === '' ? '' : await decrypt(secret);
}

async function checkSecretSurvivesPartialUpdates(): Promise<void> {
	const provider = OAUTH_PROVIDER_NAMES[0];
	if (provider === undefined) throw new Error('No OAuth provider is defined');

	await updateOAuthProviderSettings(provider, { clientId: 'id', clientSecret: SECRET }, 1);
	const raw = readStoredSettings(provider)?.settings.clientSecret ?? '';
	check(raw !== '' && raw !== SECRET, 'A supplied secret must be stored encrypted');
	check((await storedSecret(provider)) === SECRET, 'A supplied secret must decrypt to itself');

	await updateOAuthProviderSettings(provider, { enabled: true }, 1);
	check(
		(await storedSecret(provider)) === SECRET,
		'Changing another field must leave the secret decrypting to the same value',
	);

	await updateOAuthProviderSettings(provider, { callbackUrlOverride: 'https://x.test/cb' }, 1);
	await updateOAuthProviderSettings(provider, { enabled: false }, 1);
	check(
		(await storedSecret(provider)) === SECRET,
		'Repeated updates without a secret must not change it',
	);

	const listed = (await getOAuthProviderSettingsAsync()).find((row) => row.provider === provider);
	check(
		listed?.clientSecretLast4 === SECRET.slice(-4),
		`The last four characters shown must be the secret's, got ${String(listed?.clientSecretLast4)}`,
	);

	await updateOAuthProviderSettings(provider, { clientSecret: '' }, 1);
	check((await storedSecret(provider)) === '', 'An empty secret must clear the stored one');
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-oauth-secret-'));
	const dbPath = join(tmpDir, 'test.db');

	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);

	try {
		// The settings row records who changed it, so that user has to exist.
		getDb()
			.insert(users)
			.values({
				email: 'owner@example.com',
				id: 1,
				passwordHash: 'seeded-not-used',
				role: 'SYSOP',
				username: 'owner',
			})
			.run();
		await checkSecretSurvivesPartialUpdates();
	} finally {
		await closeDatabase();
		try {
			rmSync(tmpDir, { force: true, recursive: true });
		} catch {
			// Windows may briefly hold the WAL handle; temp cleanup is best-effort.
		}
	}

	if (failures.length === 0) {
		console.log(`OAuth secret update checks passed (${String(checks)} assertions).`);
		return;
	}
	console.error('[FAIL] OAuth secret update regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-oauth-secret-update:', err);
	process.exit(1);
});
