/**
 * Committed-secrets and JSON-only config policy checks.
 *
 * Extracted from scripts/check-application.ts (max-lines split).
 */
import fs from 'node:fs';
import path from 'node:path';

import { getNestedValue, isRecord, readJsonFileOrThrow } from './json-utils.ts';

/**
 * Secret-backed config keys that must contain placeholder values in tracked files.
 * Actual secrets must only live in gitignored config/{slug}.json or env vars.
 */
const SECRET_CONFIG_KEYS = [
	'security.applicationApiKey',
	'security.backupEncryptionKey',
	'security.cookieSecret',
	'security.encryptionKey',
	'security.jwtPrivateKey',
	'security.jwtPublicKey',
	'security.jwtRefreshPrivateKey',
	'security.jwtRefreshPublicKey',
	'security.mfaPrivateKey',
] as const;

/**
 * Explicit placeholder markers only. A value that merely contains the word
 * "production" (e.g. a real key pasted next to a production URL) must NOT
 * pass as a placeholder; the committed defaults use
 * `PRODUCTION_CHANGE_REQUIRED-*`, which still matches via CHANGE.?REQUIRED.
 */
const PLACEHOLDER_PATTERN = /CHANGE.?ME|CHANGE.?REQUIRED|GENERATE.?ME|PLACEHOLDER|EXAMPLE/i;

/**
 * Check that tracked config files (defaults.json, config/example.json) do not
 * contain real secret values. All secret-backed keys must use placeholder patterns.
 * This prevents secrets from being committed to the repository.
 */
export function checkNoCommittedSecrets(repoRoot: string): void {
	console.log('Checking tracked config files for committed secrets...');

	const trackedFiles = [
		path.join(repoRoot, 'backend', 'src', 'config', 'defaults.json'),
		path.join(repoRoot, 'config', 'example.json'),
	];

	const violations: string[] = [];

	for (const filePath of trackedFiles) {
		if (!fs.existsSync(filePath)) continue;

		const relativePath = path.relative(repoRoot, filePath);
		const content = readJsonFileOrThrow(filePath);
		if (!isRecord(content)) continue;

		for (const secretKey of SECRET_CONFIG_KEYS) {
			const value = getNestedValue(content, secretKey);
			if (value === undefined) continue;
			// Empty string means "no secret committed" (e.g. optional MFA keys
			// in defaults.json) — only non-empty values must be placeholders.
			if (value === '') continue;
			if (!PLACEHOLDER_PATTERN.test(value)) {
				violations.push(`${relativePath}: ${secretKey} contains a non-placeholder value`);
			}
		}
	}

	if (violations.length > 0) {
		throw new Error(
			`Committed secrets detected in tracked config files:\n  ${violations.join('\n  ')}\n` +
				'  Secret values must use PRODUCTION_CHANGE_REQUIRED-* placeholders. ' +
				'Actual secrets belong in gitignored config/{slug}.json or environment variables.'
		);
	}

	console.log('   No committed secrets found in tracked config files.');
}

/**
 * Check that no .env files exist in the repository root.
 * JSON-only configuration policy forbids dotenv files.
 */
export function checkNoEnvFiles(repoRoot: string): void {
	console.log('Checking for .env files (JSON-only config policy)...');
	const envFiles = fs.readdirSync(repoRoot).filter((name) => name.startsWith('.env'));
	if (envFiles.length > 0) {
		throw new Error(
			`JSON-only config policy violation: found .env files in repository root: ${envFiles.join(', ')}. Use config/*.json instead.`
		);
	}
	console.log('   No .env files found.');
}
