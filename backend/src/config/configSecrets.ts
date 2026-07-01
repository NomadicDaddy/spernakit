import { configLogger } from './configLogger.ts';

/**
 * Config keys that can be overridden via environment variables for secret injection.
 *
 * This file is the only approved use of process.env FOR CONFIG VALUES in the application.
 * One other read exists — configLogger.ts reads NODE_ENV at module load because the logger
 * must initialize before the Zod-validated config is available. No other production source
 * files read process.env.
 *
 * Secrets are injected via environment variables in Docker/production deployments
 * where they must not be stored in config JSON files. The bunfig.toml `env = false`
 * setting prevents automatic .env file loading; these explicit reads are the sole
 * mechanism for environment-based secret overrides.
 *
 * Environment variable names are derived from the app slug:
 *   {SLUG_UPPERCASE}_JWT_PRIVATE_KEY, {SLUG_UPPERCASE}_COOKIE_SECRET, etc.
 */
const SECRET_CONFIG_KEYS: Record<string, string> = {
	applicationApiKey: 'API_KEY',
	backupEncryptionKey: 'BACKUP_ENCRYPTION_KEY',
	backupEncryptionKeyPrevious: 'BACKUP_ENCRYPTION_KEY_PREVIOUS',
	cookieSecret: 'COOKIE_SECRET',
	encryptionKey: 'ENCRYPTION_KEY',
	jwtPrivateKey: 'JWT_PRIVATE_KEY',
	jwtPrivateKeyPrevious: 'JWT_PRIVATE_KEY_PREVIOUS',
	jwtPublicKey: 'JWT_PUBLIC_KEY',
	jwtPublicKeyPrevious: 'JWT_PUBLIC_KEY_PREVIOUS',
	jwtRefreshPrivateKey: 'JWT_REFRESH_PRIVATE_KEY',
	jwtRefreshPrivateKeyPrevious: 'JWT_REFRESH_PRIVATE_KEY_PREVIOUS',
	jwtRefreshPublicKey: 'JWT_REFRESH_PUBLIC_KEY',
	jwtRefreshPublicKeyPrevious: 'JWT_REFRESH_PUBLIC_KEY_PREVIOUS',
	mfaPrivateKey: 'MFA_PRIVATE_KEY',
	mfaPublicKey: 'MFA_PUBLIC_KEY',
};

/**
 * Nested config paths that can be overridden via environment variables.
 * Each entry maps a dot-separated config path to an env var suffix.
 *
 * Example: 'oauth.github.clientSecret' with slug 'spernakit'
 *   -> env var: SPERNAKIT_OAUTH_GITHUB_CLIENT_SECRET
 */
const NESTED_SECRET_KEYS: Record<string, string> = {
	'alerting.webhook.secret': 'ALERTING_WEBHOOK_SECRET',
	'database.url': 'DATABASE_URL',
	'oauth.github.clientSecret': 'OAUTH_GITHUB_CLIENT_SECRET',
	'oauth.google.clientSecret': 'OAUTH_GOOGLE_CLIENT_SECRET',
	'oauth.microsoft.clientSecret': 'OAUTH_MICROSOFT_CLIENT_SECRET',
	'storage.s3.secretAccessKey': 'STORAGE_S3_SECRET_ACCESS_KEY',
};

/**
 * Resolve a value from an env var, converting literal \n to real newlines (for PEM keys).
 */
function resolveEnvValue(envValue: string): string {
	return envValue.includes('\\n') ? envValue.replace(/\\n/g, '\n') : envValue;
}

function replaceSecretsWithEnvVars(
	config: Record<string, unknown>,
	slug: string
): Record<string, unknown> {
	const result = structuredClone(config);
	const prefix = slug.toUpperCase().replace(/-/g, '_');

	// Handle flat security.* keys
	if (result.security && typeof result.security === 'object') {
		const security = result.security as Record<string, string>;

		for (const [configPath, envSuffix] of Object.entries(SECRET_CONFIG_KEYS)) {
			const envVar = `${prefix}_${envSuffix}`;
			const envValue = process.env[envVar];
			if (envValue && typeof security[configPath] === 'string') {
				security[configPath] = resolveEnvValue(envValue);
				configLogger.info(
					{
						configPath: `security.${configPath}`,
						envVar,
						masked: `[${envValue.length} chars]`,
					},
					'Secret loaded from environment variable'
				);
			}
		}
	}

	// Handle nested config paths (oauth, storage, alerting, database)
	for (const [dotPath, envSuffix] of Object.entries(NESTED_SECRET_KEYS)) {
		const envVar = `${prefix}_${envSuffix}`;
		const envValue = process.env[envVar];
		if (!envValue) continue;

		const segments = dotPath.split('.');
		const leafKey = segments.pop();
		if (!leafKey) continue;

		let target: Record<string, unknown> = result;
		let valid = true;

		// Traverse to the parent object
		for (const segment of segments) {
			if (target[segment] && typeof target[segment] === 'object') {
				target = target[segment] as Record<string, unknown>;
			} else {
				valid = false;
				break;
			}
		}

		if (!valid) continue;

		if (typeof target[leafKey] === 'string') {
			target[leafKey] = resolveEnvValue(envValue);
			configLogger.info(
				{
					configPath: dotPath,
					envVar,
					masked: `[${envValue.length} chars]`,
				},
				'Secret loaded from environment variable'
			);
		}
	}

	return result;
}

export { replaceSecretsWithEnvVars };
