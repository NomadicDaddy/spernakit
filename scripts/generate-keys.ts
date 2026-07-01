#!/usr/bin/env bun
/**
 * Secure Key Generation Script
 *
 * Generates cryptographically secure keys including EC P-256 key pairs for JWT.
 * Updates the JSON config file (config/{appname}.json) with new keys.
 *
 * Usage:
 *   bun run generate-keys
 */
import fs from 'node:fs';
import path from 'node:path';

import {
	generateEcKeyPair,
	generateHexKey,
	generateSecureKey,
	type EcKeyPair,
} from './lib/crypto-keys.ts';
import { loadJsonConfig } from './load-json-config.js';

interface GeneratedKeys {
	APPLICATION_API_KEY: string;
	BACKUP_ENCRYPTION_KEY: string;
	COOKIE_SECRET: string;
	ENCRYPTION_KEY: string;
	JWT_KEY_PAIR: EcKeyPair;
	JWT_REFRESH_KEY_PAIR: EcKeyPair;
	MFA_KEY_PAIR: EcKeyPair;
}

interface AppConfig {
	[key: string]: unknown;
	security: {
		applicationApiKey?: string;
		backupEncryptionKey?: string;
		cookieSecret?: string;
		encryptionKey?: string;
		jwtPrivateKey?: string;
		jwtPublicKey?: string;
		jwtRefreshPrivateKey?: string;
		jwtRefreshPublicKey?: string;
		mfaPrivateKey?: string;
		mfaPublicKey?: string;
	};
}

const configDir = path.join(process.cwd(), 'config');
const { appSlug } = loadJsonConfig();
const configPath = path.join(configDir, `${appSlug}.json`);

function generateAllKeys(): GeneratedKeys {
	console.log('Generating secure cryptographic keys...\n');

	const keys: GeneratedKeys = {
		APPLICATION_API_KEY: generateSecureKey(48),
		BACKUP_ENCRYPTION_KEY: generateHexKey(32),
		COOKIE_SECRET: generateSecureKey(32),
		ENCRYPTION_KEY: generateHexKey(32),
		JWT_KEY_PAIR: generateEcKeyPair(),
		JWT_REFRESH_KEY_PAIR: generateEcKeyPair(),
		MFA_KEY_PAIR: generateEcKeyPair(),
	};

	console.log('Generated keys:');
	console.log(`  APPLICATION_API_KEY: ${keys.APPLICATION_API_KEY.length} characters`);
	console.log(`  BACKUP_ENCRYPTION_KEY: ${keys.BACKUP_ENCRYPTION_KEY.length} characters`);
	console.log(`  COOKIE_SECRET: ${keys.COOKIE_SECRET.length} characters`);
	console.log(`  ENCRYPTION_KEY: ${keys.ENCRYPTION_KEY.length} characters`);
	console.log(`  JWT_KEY_PAIR: EC P-256 (ES256)`);
	console.log(`  JWT_REFRESH_KEY_PAIR: EC P-256 (ES256)`);
	console.log(`  MFA_KEY_PAIR: EC P-256 (ES256)`);

	return keys;
}

function readConfig(): AppConfig {
	if (!fs.existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}
	return JSON.parse(fs.readFileSync(configPath, 'utf8')) as AppConfig;
}

/** Number of config backups to retain (newest first). */
const MAX_CONFIG_BACKUPS = 3;

function backupConfig(): void {
	if (fs.existsSync(configPath)) {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupPath = `${configPath}.backup.${timestamp}`;
		fs.copyFileSync(configPath, backupPath);
		console.log(`Backed up existing config to: ${path.basename(backupPath)}`);
		pruneOldBackups();
	}
}

/**
 * Delete old `config/{slug}.json.backup.<timestamp>` files, keeping the newest
 * MAX_CONFIG_BACKUPS. These backups contain real secrets and previously
 * accumulated forever.
 */
function pruneOldBackups(): void {
	const backupPrefix = `${path.basename(configPath)}.backup.`;
	const backups = fs
		.readdirSync(configDir)
		.filter((name) => name.startsWith(backupPrefix))
		.sort()
		.reverse(); // ISO timestamps sort lexicographically; newest first

	for (const stale of backups.slice(MAX_CONFIG_BACKUPS)) {
		fs.unlinkSync(path.join(configDir, stale));
		console.log(`Pruned old config backup: ${stale}`);
	}
}

function updateConfig(keys: GeneratedKeys): void {
	console.log('\nUpdating JSON config file...');

	const config = readConfig();
	config.security.jwtPrivateKey = keys.JWT_KEY_PAIR.privateKey;
	config.security.jwtPublicKey = keys.JWT_KEY_PAIR.publicKey;
	config.security.jwtRefreshPrivateKey = keys.JWT_REFRESH_KEY_PAIR.privateKey;
	config.security.jwtRefreshPublicKey = keys.JWT_REFRESH_KEY_PAIR.publicKey;
	config.security.mfaPrivateKey = keys.MFA_KEY_PAIR.privateKey;
	config.security.mfaPublicKey = keys.MFA_KEY_PAIR.publicKey;
	config.security.encryptionKey = keys.ENCRYPTION_KEY;
	config.security.backupEncryptionKey = keys.BACKUP_ENCRYPTION_KEY;
	config.security.cookieSecret = keys.COOKIE_SECRET;
	config.security.applicationApiKey = keys.APPLICATION_API_KEY;

	fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
	console.log(`Config file updated: ${configPath}`);
}

function hasExistingKeys(): boolean {
	if (fs.existsSync(configPath)) {
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as AppConfig;
		return Boolean(
			config.security?.jwtPrivateKey &&
			config.security.jwtPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----')
		);
	}
	return false;
}

function run(): void {
	try {
		console.log(`Secure Key Generator\n`);
		console.log(`Config file: config/${appSlug}.json\n`);

		if (hasExistingKeys()) {
			console.log('WARNING: EXISTING KEYS DETECTED');
			console.log('You are about to replace existing cryptographic keys.');
			console.log('- All encrypted data will become UNREADABLE with new keys');
			console.log('- All user sessions will be INVALIDATED immediately');
			console.log('- Application will need to be RESTARTED\n');

			if (process.env['NODE_ENV'] === 'production') {
				console.log('PRODUCTION ENVIRONMENT DETECTED');
				console.log('Key regeneration in production is extremely dangerous!');
				console.log('Set FORCE_KEY_GENERATION=true to override.\n');

				if (!process.env['FORCE_KEY_GENERATION']) {
					console.log('Key generation aborted for safety');
					process.exit(1);
				}
			}
		}

		backupConfig();
		const keys = generateAllKeys();
		updateConfig(keys);

		console.log('\nKey generation completed successfully!');
		console.log('Restart your application to use the new keys.');
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error('\nKey generation failed:', typedErr.message);
		process.exit(1);
	}
}

run();
