import type { AppConfig } from './configSchema.ts';

import { configLogger } from './configLogger.ts';
import {
	checkEncryptionKeyFormat,
	checkKnownDevKeys,
	checkPemKeyFormat,
	checkMfaKeyPair,
	checkPlaceholderPemKeys,
	checkPlaceholderSecrets,
	checkSecretStrength,
	type PemKeyField,
	type SecretField,
	type ValidationIssue,
} from './configValidator-secrets-checks.ts';

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

function getSecretFields(configData: AppConfig): SecretField[] {
	return [
		{
			minLength: 32,
			name: 'security.applicationApiKey',
			value: configData.security.applicationApiKey,
		},
		{
			minLength: 64,
			name: 'security.backupEncryptionKey',
			value: configData.security.backupEncryptionKey,
		},
		{ minLength: 32, name: 'security.cookieSecret', value: configData.security.cookieSecret },
		{
			minLength: 32,
			name: 'security.encryptionKey',
			value: configData.security.encryptionKey,
		},
	];
}

function getPemKeyFields(configData: AppConfig): PemKeyField[] {
	return [
		{
			expectedHeader: '-----BEGIN PRIVATE KEY-----',
			name: 'security.jwtPrivateKey',
			value: configData.security.jwtPrivateKey,
		},
		{
			expectedHeader: '-----BEGIN PUBLIC KEY-----',
			name: 'security.jwtPublicKey',
			value: configData.security.jwtPublicKey,
		},
		{
			expectedHeader: '-----BEGIN PRIVATE KEY-----',
			name: 'security.jwtRefreshPrivateKey',
			value: configData.security.jwtRefreshPrivateKey,
		},
		{
			expectedHeader: '-----BEGIN PUBLIC KEY-----',
			name: 'security.jwtRefreshPublicKey',
			value: configData.security.jwtRefreshPublicKey,
		},
		{
			expectedHeader: '-----BEGIN PRIVATE KEY-----',
			name: 'security.mfaPrivateKey',
			value: configData.security.mfaPrivateKey,
		},
		{
			expectedHeader: '-----BEGIN PUBLIC KEY-----',
			name: 'security.mfaPublicKey',
			value: configData.security.mfaPublicKey,
		},
	];
}

// ---------------------------------------------------------------------------
// Runtime validators — call predicates, then log/exit
// ---------------------------------------------------------------------------

function emitSecretIssues(issues: ValidationIssue[], context: string, hint?: string): void {
	if (issues.length === 0) return;
	const hasError = issues.some((i) => i.level === 'error');
	const pinoLevel = hasError ? 'error' : 'warn';
	const label = hasError ? 'SECURITY ERROR' : 'SECURITY WARNING';

	configLogger[pinoLevel](
		{ fields: issues.map((i) => `${i.field} (${i.message})`) },
		`${label}: ${context}`
	);
	if (hint) configLogger.info(hint);
	if (hasError) process.exit(1);
}

function validatePlaceholderSecrets(nodeEnv: string, secretFields: SecretField[]): void {
	const isDev = nodeEnv === 'development';
	const issues = checkPlaceholderSecrets(isDev, secretFields);
	emitSecretIssues(
		issues,
		isDev
			? 'Placeholder secrets detected — run "bun run generate-keys" to generate unique secrets'
			: 'Placeholder secrets detected in non-development environment',
		'\nGenerate new secrets with: bun run generate-keys'
	);
}

function validateSecretStrength(nodeEnv: string, secretFields: SecretField[]): void {
	if (nodeEnv === 'development') return;
	const issues = checkSecretStrength(secretFields);
	emitSecretIssues(
		issues,
		'Weak secrets detected in non-development environment',
		'\nGenerate secure secrets with: bun run generate-keys\n\nOr use OpenSSL: openssl rand -base64 32'
	);
}

function validatePemKeys(nodeEnv: string, pemFields: PemKeyField[]): void {
	const isDev = nodeEnv === 'development';
	const placeholderIssues = checkPlaceholderPemKeys(isDev, pemFields);
	emitSecretIssues(
		placeholderIssues,
		isDev
			? 'Placeholder PEM keys detected — run "bun run generate-keys" to generate EC key pairs'
			: 'Placeholder PEM keys detected in non-development environment',
		'\nGenerate EC key pairs with: bun run generate-keys'
	);

	if (isDev) return;
	const formatIssues = checkPemKeyFormat(pemFields);
	emitSecretIssues(
		formatIssues,
		'Invalid PEM keys detected',
		'\nGenerate EC key pairs with: bun run generate-keys'
	);
}

function validateKnownDevKeys(nodeEnv: string, security: AppConfig['security']): void {
	if (nodeEnv === 'development' || nodeEnv === 'test') return;
	const issues = checkKnownDevKeys(security);
	emitSecretIssues(
		issues,
		'Known development keys/secrets detected in non-development environment. ' +
			'These keys are committed to Git and publicly known.',
		'\nGenerate unique keys with: bun run generate-keys'
	);
}

function validateEncryptionKeyFormat(nodeEnv: string, encryptionKey: string): void {
	if (nodeEnv === 'development') return;
	const issues = checkEncryptionKeyFormat(encryptionKey);
	emitSecretIssues(issues, 'Invalid encryption key format');
}

function validateMfaKeyPair(nodeEnv: string, security: AppConfig['security']): void {
	emitSecretIssues(
		checkMfaKeyPair(nodeEnv, security),
		'Incomplete MFA challenge key pair',
		'\nGenerate the dedicated MFA key pair with: bun run generate-keys'
	);
}

// ---------------------------------------------------------------------------
// Collect function — delegates to same predicates
// ---------------------------------------------------------------------------

/**
 * Collect secret validation issues as data instead of logging/exiting.
 * Used by config:validate script for standalone validation.
 */
function collectSecretIssues(
	nodeEnv: string,
	secretFields: SecretField[],
	pemKeyFields: PemKeyField[],
	security: AppConfig['security']
): ValidationIssue[] {
	const isDev = nodeEnv === 'development';
	const isDevOrTest = isDev || nodeEnv === 'test';

	return [
		...checkPlaceholderSecrets(isDev, secretFields),
		...(isDev ? [] : checkSecretStrength(secretFields)),
		...checkPlaceholderPemKeys(isDev, pemKeyFields),
		...(isDev ? [] : checkPemKeyFormat(pemKeyFields)),
		...checkMfaKeyPair(nodeEnv, security),
		...(isDevOrTest ? [] : checkKnownDevKeys(security)),
		...(isDev ? [] : checkEncryptionKeyFormat(security.encryptionKey)),
	];
}

export {
	collectSecretIssues,
	getSecretFields,
	getPemKeyFields,
	type ValidationIssue,
	validateEncryptionKeyFormat,
	validateKnownDevKeys,
	validateMfaKeyPair,
	validatePemKeys,
	validatePlaceholderSecrets,
	validateSecretStrength,
};
