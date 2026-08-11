#!/usr/bin/env bun
/**
 * Secure Key Generation Script
 *
 * Generates cryptographically secure keys including EC P-256 key pairs for JWT.
 * Updates the JSON config file (config/{appname}.json) with new keys.
 *
 * Rotating a key that is already in use destroys whatever that key protects, so
 * `--only` exists to keep a repair scoped to the field that actually needs one.
 * The key catalog and the `--only` parser live in scripts/lib/key-groups.ts.
 *
 * Usage:
 *   bun run generate-keys                              # every key group
 *   bun run generate-keys -- --only mfa                # one group
 *   bun run generate-keys -- --only mfa,cookie-secret  # several groups
 */
import fs from 'node:fs';
import path from 'node:path';

import type { GroupName, SecuritySection } from './lib/key-groups.ts';

import { PLACEHOLDER_PATTERN } from '../backend/src/config/configValidator-secrets-checks.ts';
import { KEY_GROUPS, parseSelection } from './lib/key-groups.ts';
import { loadJsonConfig } from './load-json-config.js';

interface AppConfig {
	[key: string]: unknown;
	security: SecuritySection;
}

const configDir = path.join(process.cwd(), 'config');
const { appSlug } = loadJsonConfig();
const configPath = path.join(configDir, `${appSlug}.json`);

function generateKeys(selected: GroupName[]): SecuritySection {
	console.log('Generating secure cryptographic keys...\n');

	const patch: SecuritySection = {};
	console.log('Generated keys:');
	for (const name of selected) {
		Object.assign(patch, KEY_GROUPS[name].generate());
		console.log(`  ${KEY_GROUPS[name].label}`);
	}

	return patch;
}

function readConfigRaw(): string {
	if (!fs.existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}
	return fs.readFileSync(configPath, 'utf8');
}

function readConfig(): AppConfig {
	return JSON.parse(readConfigRaw()) as AppConfig;
}

/**
 * Read the indentation, line ending, and trailing newline of an existing config.
 *
 * Every other writer in the template builds `config/{slug}.json` from `defaults.json`,
 * where the template's own tab style is the correct one. This script is the only one
 * that edits a file someone else already owns, so a two-key repair here must not
 * reformat a config an operator maintains by hand.
 */
function detectJsonStyle(raw: string): { eol: string; indent: string; trailingNewline: boolean } {
	// The first indented line of a JSON object is a depth-1 key, so its leading
	// whitespace is exactly one indent unit.
	const firstIndent = /\n([ \t]+)"/.exec(raw)?.[1];
	return {
		eol: raw.includes('\r\n') ? '\r\n' : '\n',
		indent: firstIndent ?? '\t',
		trailingNewline: raw.endsWith('\n'),
	};
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
 * MAX_CONFIG_BACKUPS. Limiting retention reduces exposure of secret-bearing files.
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

function updateConfig(patch: SecuritySection): void {
	console.log('\nUpdating JSON config file...');

	const raw = readConfigRaw();
	const config = JSON.parse(raw) as AppConfig;
	Object.assign(config.security, patch);

	const { eol, indent, trailingNewline } = detectJsonStyle(raw);
	// Every newline JSON.stringify emits is structural; newlines inside string
	// values (PEM keys) are escaped as \n, so a blanket replace is safe.
	let serialized = JSON.stringify(config, null, indent);
	if (eol !== '\n') serialized = serialized.replaceAll('\n', eol);
	if (trailingNewline) serialized += eol;

	fs.writeFileSync(configPath, serialized, 'utf8');
	console.log(`Config file updated: ${configPath}`);
}

/** A field is provisioned when it holds a real value rather than nothing or a placeholder marker. */
function isProvisioned(value: string | undefined): boolean {
	const trimmed = value?.trim() ?? '';
	return trimmed.length > 0 && !PLACEHOLDER_PATTERN.test(trimmed);
}

/** Selected groups whose fields already hold real values, so rotating them destroys something. */
function groupsInUse(selected: GroupName[]): GroupName[] {
	if (!fs.existsSync(configPath)) return [];
	const security = readConfig().security ?? {};
	return selected.filter((name) =>
		KEY_GROUPS[name].fields.some((field) => isProvisioned(security[field])),
	);
}

function run(): void {
	try {
		const selected = parseSelection(process.argv.slice(2));

		console.log(`Secure Key Generator\n`);
		console.log(`Config file: config/${appSlug}.json`);
		console.log(`Key groups: ${selected.join(', ')}\n`);

		const inUse = groupsInUse(selected);
		if (inUse.length > 0) {
			console.log('WARNING: EXISTING KEYS DETECTED');
			console.log('You are about to replace keys that are already in use:');
			for (const name of inUse) {
				console.log(`- ${name}: ${KEY_GROUPS[name].consequence}`);
			}
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
		updateConfig(generateKeys(selected));

		console.log('\nKey generation completed successfully!');
		console.log('Restart your application to use the new keys.');
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error('\nKey generation failed:', typedErr.message);
		process.exit(1);
	}
}

run();
