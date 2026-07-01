import { createHash } from 'node:crypto';

import type { AppConfig } from './configSchema.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationIssue {
	field: string;
	level: 'error' | 'warning';
	message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERN = /CHANGE.?ME|CHANGE.?REQUIRED|GENERATE.?ME/i;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;
const MIN_UNIQUE_CHARS_HEX = 10;
const MIN_UNIQUE_CHARS_DEFAULT = 12;

/**
 * SHA-256 fingerprint prefixes of the known development keys committed
 * in config/spernakit.json. If any production deployment uses these exact
 * keys, startup is blocked because they are publicly known from Git.
 */
const KNOWN_DEV_KEY_FINGERPRINTS = new Set([
	'89fb67ead9d9f926', // jwtPrivateKey from config/spernakit.json
	'41c0a95e2a89b7d1', // jwtRefreshPrivateKey from config/spernakit.json
	'19aa8daa9b50fb3a', // mfaPrivateKey from config/spernakit.json
	'2c72eaa2f09ca781', // mfaPublicKey from config/spernakit.json
	'6a790ac091530510', // cookieSecret from config/spernakit.json
	'0e193a085c4cee6a', // encryptionKey from config/spernakit.json
	'ea3bd27688a3555d', // applicationApiKey from config/spernakit.json
]);

function fingerprintSecret(value: string): string {
	return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Predicate functions — return issue data
// ---------------------------------------------------------------------------

interface SecretField {
	minLength: number;
	name: string;
	value: string;
}

interface PemKeyField {
	expectedHeader: string;
	name: string;
	value: string;
}

function checkPlaceholderSecrets(isDev: boolean, secretFields: SecretField[]): ValidationIssue[] {
	const placeholders = secretFields.filter((f) => PLACEHOLDER_PATTERN.test(f.value));
	return placeholders.map((f) => ({
		field: f.name,
		level: isDev ? ('warning' as const) : ('error' as const),
		message: 'placeholder value detected — run "bun run generate-keys"',
	}));
}

function checkSecretStrength(secretFields: SecretField[]): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	for (const field of secretFields) {
		if (!field.value || typeof field.value !== 'string') {
			issues.push({ field: field.name, level: 'error', message: 'is empty or invalid' });
			continue;
		}
		if (field.value.length < (field.minLength ?? 32)) {
			issues.push({
				field: field.name,
				level: 'error',
				message: `too short (${field.value.length} chars, minimum ${field.minLength})`,
			});
			continue;
		}
		const uniqueChars = new Set(field.value.split('')).size;
		const isHex = HEX_PATTERN.test(field.value);
		const isBase64 = !isHex && BASE64_PATTERN.test(field.value);
		const minUnique = isHex ? MIN_UNIQUE_CHARS_HEX : MIN_UNIQUE_CHARS_DEFAULT;
		const charClass = isHex ? 'hex' : isBase64 ? 'base64' : 'mixed';
		if (uniqueChars < minUnique) {
			issues.push({
				field: field.name,
				level: 'error',
				message: `low diversity (${uniqueChars} unique ${charClass} chars, minimum ${minUnique})`,
			});
		}
	}
	return issues;
}

function checkPlaceholderPemKeys(isDev: boolean, pemKeyFields: PemKeyField[]): ValidationIssue[] {
	const placeholders = pemKeyFields.filter((f) => PLACEHOLDER_PATTERN.test(f.value));
	return placeholders.map((f) => ({
		field: f.name,
		level: isDev ? ('warning' as const) : ('error' as const),
		message: 'placeholder PEM key — run "bun run generate-keys"',
	}));
}

function checkPemKeyFormat(pemKeyFields: PemKeyField[]): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	for (const field of pemKeyFields) {
		if (!field.value && field.name.startsWith('security.mfa')) continue;
		if (PLACEHOLDER_PATTERN.test(field.value)) continue;
		if (!field.value.startsWith(field.expectedHeader)) {
			issues.push({
				field: field.name,
				level: 'error',
				message: `does not start with ${field.expectedHeader}`,
			});
		}
	}
	return issues;
}

function checkMfaKeyPair(nodeEnv: string, security: AppConfig['security']): ValidationIssue[] {
	const hasPrivateKey = security.mfaPrivateKey.trim().length > 0;
	const hasPublicKey = security.mfaPublicKey.trim().length > 0;
	const isProduction = nodeEnv === 'production';

	if (!isProduction && !hasPrivateKey && !hasPublicKey) return [];

	if (!hasPrivateKey || !hasPublicKey) {
		return [
			{
				field: hasPrivateKey ? 'security.mfaPublicKey' : 'security.mfaPrivateKey',
				level: isProduction ? 'error' : 'warning',
				message:
					'MFA challenge signing requires both security.mfaPrivateKey and security.mfaPublicKey',
			},
		];
	}

	const reusesAccessKeys =
		security.mfaPrivateKey === security.jwtPrivateKey ||
		security.mfaPublicKey === security.jwtPublicKey;
	const reusesRefreshKeys =
		security.mfaPrivateKey === security.jwtRefreshPrivateKey ||
		security.mfaPublicKey === security.jwtRefreshPublicKey;

	if (!reusesAccessKeys && !reusesRefreshKeys) return [];

	return [
		{
			field: 'security.mfaPrivateKey',
			level: isProduction ? 'error' : 'warning',
			message: 'MFA challenge keys must be dedicated and must not reuse JWT signing keys',
		},
	];
}

function checkKnownDevKeys(security: AppConfig['security']): ValidationIssue[] {
	const fieldsToCheck = [
		{ name: 'security.jwtPrivateKey', value: security.jwtPrivateKey },
		{ name: 'security.jwtRefreshPrivateKey', value: security.jwtRefreshPrivateKey },
		{ name: 'security.mfaPrivateKey', value: security.mfaPrivateKey },
		{ name: 'security.mfaPublicKey', value: security.mfaPublicKey },
		{ name: 'security.cookieSecret', value: security.cookieSecret },
		{ name: 'security.encryptionKey', value: security.encryptionKey },
		{ name: 'security.applicationApiKey', value: security.applicationApiKey },
	];
	const matches = fieldsToCheck.filter((f) =>
		KNOWN_DEV_KEY_FINGERPRINTS.has(fingerprintSecret(f.value))
	);
	return matches.map((f) => ({
		field: f.name,
		level: 'error' as const,
		message: 'known development key (committed to Git) — generate unique keys',
	}));
}

function checkEncryptionKeyFormat(encryptionKey: string): ValidationIssue[] {
	if (!encryptionKey) return [];
	if (!HEX_PATTERN.test(encryptionKey)) {
		return [
			{
				field: 'security.encryptionKey',
				level: 'error',
				message: 'contains non-hex characters — must be a 64-character hex string',
			},
		];
	}
	if (encryptionKey.length !== 64) {
		return [
			{
				field: 'security.encryptionKey',
				level: 'error',
				message: `must be exactly 64 hex characters (got ${encryptionKey.length})`,
			},
		];
	}
	return [];
}

export {
	checkEncryptionKeyFormat,
	checkKnownDevKeys,
	checkMfaKeyPair,
	checkPemKeyFormat,
	checkPlaceholderPemKeys,
	checkPlaceholderSecrets,
	checkSecretStrength,
};
export type { PemKeyField, SecretField, ValidationIssue };
