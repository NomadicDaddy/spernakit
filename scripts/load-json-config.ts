/**
 * Shared JSON Config Loader for Scripts
 *
 * Loads configuration from JSON config file (config/{appname}.json)
 * and populates process.env for scripts to use.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { AppConfig, LoadedConfig } from './lib/app-config-types.ts';

import { generateEcKeyPair, generateHexKey, generateSecureKey } from './lib/crypto-keys.ts';

export type { AppConfig, LoadedConfig } from './lib/app-config-types.ts';

/**
 * Resolve the app slug via three fallbacks: env vars → defaults.json →
 * single-file scan of configDir. Exits with a user-facing error if none
 * of the fallbacks succeed.
 */
function resolveAppSlug(repoRoot: string, configDir: string): string {
	let appSlug = process.env['VITE_APP_SLUG'] || process.env['APP_SLUG'];
	if (!appSlug) {
		const defaultsPath = path.join(repoRoot, 'backend', 'src', 'config', 'defaults.json');
		if (fs.existsSync(defaultsPath)) {
			try {
				const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as {
					app?: { slug?: string };
				};
				appSlug = defaults.app?.slug;
			} catch {
				appSlug = undefined;
			}
		}
	}
	if (!appSlug && fs.existsSync(configDir)) {
		const configFiles = fs
			.readdirSync(configDir)
			.filter((f) => f.endsWith('.json') && !f.startsWith('.'));
		if (configFiles.length === 1 && configFiles[0]) {
			appSlug = configFiles[0].replace(/\.json$/, '');
		}
	}
	if (!appSlug) {
		console.error(
			'❌ Unable to determine app slug. Set APP_SLUG/VITE_APP_SLUG or ensure defaults.json or config/*.json is present.'
		);
		process.exit(1);
	}
	return appSlug;
}

/**
 * Auto-create a config file from backend/src/config/defaults.json on first
 * run, injecting freshly generated cryptographic keys. Preserves the
 * existing "auto-create from defaults" behavior so dev startup never
 * requires a manual config copy.
 */
function createConfigFromDefaults(repoRoot: string, configDir: string, configPath: string): void {
	const defaultsPath = path.join(repoRoot, 'backend', 'src', 'config', 'defaults.json');
	if (!fs.existsSync(defaultsPath)) {
		console.error(`❌ JSON config not found: ${configPath}`);
		console.error(
			'   defaults.json is also missing; run setup or restore backend/src/config/defaults.json.'
		);
		process.exit(1);
	}
	try {
		const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as AppConfig;
		const jwtKeyPair = generateEcKeyPair();
		const jwtRefreshKeyPair = generateEcKeyPair();
		const newConfig: AppConfig = {
			...defaults,
			security: {
				...(defaults.security ?? {}),
				applicationApiKey: generateSecureKey(48),
				cookieSecret: generateSecureKey(32),
				encryptionKey: generateHexKey(32),
				jwtPrivateKey: jwtKeyPair.privateKey,
				jwtPublicKey: jwtKeyPair.publicKey,
				jwtRefreshPrivateKey: jwtRefreshKeyPair.privateKey,
				jwtRefreshPublicKey: jwtRefreshKeyPair.publicKey,
			},
		};
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}
		fs.writeFileSync(configPath, JSON.stringify(newConfig, null, '\t'), 'utf8');
		console.log(`⚠️  JSON config not found. Created ${configPath} from defaults.json.`);
	} catch (err: unknown) {
		console.error(
			`❌ Failed to create JSON config from defaults at ${defaultsPath}: ${String(err)}`
		);
		process.exit(1);
	}
}

/**
 * Merge crawl-test credentials from the gitignored testing.local.json into
 * the loaded config. Warn-only if the file is invalid so a broken dev
 * file does not break production or CI loads.
 */
function mergeTestCredentials(config: AppConfig, configDir: string): void {
	const testingLocalPath = path.join(configDir, 'testing.local.json');
	if (!fs.existsSync(testingLocalPath)) return;
	try {
		const testingLocal = JSON.parse(fs.readFileSync(testingLocalPath, 'utf8')) as {
			crawlLoginEmail?: string;
			crawlLoginPassword?: string;
		};
		if (!config.testing) {
			config.testing = {};
		}
		if (testingLocal.crawlLoginEmail) {
			config.testing.crawlLoginEmail = testingLocal.crawlLoginEmail;
		}
		if (testingLocal.crawlLoginPassword) {
			config.testing.crawlLoginPassword = testingLocal.crawlLoginPassword;
		}
	} catch (err: unknown) {
		console.warn(
			`⚠️  Failed to load test credentials from ${testingLocalPath}: ${String(err)}`
		);
	}
}

/**
 * Load JSON config and populate process.env
 * Returns the loaded config and appSlug for direct use by callers
 */
export function loadJsonConfig(rootDir?: string): LoadedConfig {
	const repoRoot = rootDir || path.resolve(process.cwd());
	const configDir = process.env['CONFIG_DIR'] || path.join(repoRoot, 'config');
	const appSlug = resolveAppSlug(repoRoot, configDir);
	const configPath = path.join(configDir, `${appSlug}.json`);
	if (!fs.existsSync(configPath)) {
		createConfigFromDefaults(repoRoot, configDir, configPath);
	}
	try {
		const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		mergeTestCredentials(config, configDir);
		return { appSlug, config };
	} catch (err: unknown) {
		console.error('❌ Failed to load JSON config:', err);
		throw err;
	}
}

/**
 * Get frontend URL from config
 */
export function getFrontendUrl(config: AppConfig, mode: string = 'dev'): string {
	const url = config.server?.frontendUrl;
	if (!url) {
		throw new Error(`server.frontendUrl is not configured in JSON config (mode: ${mode}).`);
	}
	return url.replace(/\/$/, '');
}

/**
 * Get backend URL from config
 */
export function getBackendUrl(config: AppConfig): string {
	const url = config.server?.backendUrl;
	if (!url) {
		throw new Error('server.backendUrl is not configured in JSON config.');
	}
	return url.replace(/\/$/, '');
}
