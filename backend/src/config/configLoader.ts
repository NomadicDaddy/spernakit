import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { configLogger } from './configLogger.ts';
import { type AppConfig, appConfigSchema } from './configSchema.ts';
import { replaceSecretsWithEnvVars } from './configSecrets.ts';
import {
	deepMerge,
	ensureFrontendOrigin,
	getAppSlug,
	loadDefaults,
	projectRoot,
} from './configUtils.ts';
import { validateSecurityRequirements } from './configValidator.ts';

let config: AppConfig | null = null;

/**
 * Load the user config file, creating it from defaults if it doesn't exist.
 *
 * @param configPath - Absolute path to the user config JSON file
 * @param configDir - Directory containing config files
 * @param defaults - Parsed defaults.json content
 * @returns Parsed user config object
 */
function loadOrCreateUserConfig(
	configPath: string,
	configDir: string,
	defaults: Record<string, unknown>
): Record<string, unknown> {
	if (existsSync(configPath)) {
		try {
			return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
		} catch (err) {
			throw new Error(
				`Failed to parse config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
				{ cause: err }
			);
		}
	}
	if (!existsSync(configDir)) {
		mkdirSync(configDir, { mode: 0o700, recursive: true });
	}
	// 0o600: the config file holds plaintext secret material (jwtPrivateKey,
	// cookieSecret, encryptionKey). Restrict to owner read/write so other local
	// OS users cannot read master key material (matches backupEncryptionService).
	writeFileSync(configPath, JSON.stringify(defaults, null, '\t'), {
		encoding: 'utf8',
		mode: 0o600,
	});
	configLogger.warn(
		{ configPath },
		'Config auto-created from defaults with placeholder secrets. ' +
			'You MUST update secrets before running in production.'
	);
	return defaults;
}

/**
 * Validate merged config against the TypeBox schema.
 * Exits the process if validation fails (unrecoverable at startup).
 *
 * @param raw - Merged config object to validate
 * @returns Validated AppConfig
 */
function parseConfigSchema(raw: Record<string, unknown>): AppConfig {
	const result = appConfigSchema.safeParse(raw);
	if (result.success) {
		return result.data;
	}
	configLogger.error({ issues: result.error.issues }, 'Configuration validation failed');
	for (const issue of result.error.issues) {
		configLogger.error(
			{ message: issue.message, path: issue.path.join('.') },
			'  Validation issue'
		);
	}
	throw new Error(
		`Configuration validation failed with ${result.error.issues.length} issue(s). See logs above.`
	);
}

/**
 * Initialize the application configuration.
 *
 * 1. Load defaults.json
 * 2. Deep-merge with config/{slug}.json (or create from defaults)
 * 3. Validate with the TypeBox schema
 * 4. Run security checks
 * 5. Store in module-level singleton
 */
function initializeConfig(): AppConfig {
	const defaults = loadDefaults();
	const slug = getAppSlug(defaults);
	const configDir = join(projectRoot, 'config');
	const configPath = join(configDir, `${slug}.json`);

	const userConfig = loadOrCreateUserConfig(configPath, configDir, defaults);
	const merged = deepMerge(defaults, userConfig);
	const withEnvVars = replaceSecretsWithEnvVars(merged, slug);
	ensureFrontendOrigin(withEnvVars);

	const validated = parseConfigSchema(withEnvVars);
	validateSecurityRequirements(validated);

	config = validated;
	return config;
}

/**
 * Get the current application configuration.
 * Throws if initializeConfig() has not been called.
 */
function getConfig(): AppConfig {
	if (!config) {
		throw new Error('Config not initialized. Call initializeConfig() first.');
	}
	return config;
}

export { getConfig, initializeConfig };
