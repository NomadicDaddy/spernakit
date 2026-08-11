/**
 * Generates the instance JSON config (config/{slug}.json) and syncs
 * backend/src/config/defaults.json and config/example.json with the chosen settings.
 *
 * Extracted from scripts/setup.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { SecurityKeys } from './keys.ts';

import { updateJsonFile } from './json-files.ts';

export interface SetupSettings {
	appDescription: string;
	appName: string;
	appSlug: string;
	appVersion: string;
	backendPort: string;
	frontendPort: string;
}

/**
 * The branding every config file carries: identity, ports, cookie names, database path, dev origin.
 * Applied to all three tracked configs from one place because they were applied from three and one
 * of them was missed. `config/example.json` went out the door still declaring slug `spernakit`,
 * cookie `spernakit_auth` and `file:./data/spernakit.db`; ten of the eleven derived apps carry that
 * file today, byte-identical to the template's. It is the only tracked config a fresh clone has, so
 * an operator following `README.md` copies it into place and starts an app whose cookies collide
 * with every other app on localhost (cookies are not port-scoped) and whose slug names a different
 * application. Nothing caught it: drift detection excluded all of `config/`, so the manifest entry
 * calling this file branded described a check that never ran.
 *
 * Secrets are deliberately not written here. `config/example.json` and `defaults.json` are tracked,
 * and `check:secrets-policy` requires their credential fields to stay at the PRODUCTION_CHANGE_
 * REQUIRED placeholders; only the untracked instance config receives generated keys.
 */
function applyBranding(config: Record<string, unknown>, s: SetupSettings): void {
	const frontendUrl = `http://localhost:${s.frontendPort}`;
	const backendUrl = `http://localhost:${s.backendPort}`;
	const section = (key: string): Record<string, unknown> | undefined =>
		config[key] as Record<string, unknown> | undefined;

	const app = section('app');
	if (app)
		Object.assign(app, { description: s.appDescription, name: s.appName, slug: s.appSlug });

	const server = section('server');
	if (server) {
		Object.assign(server, {
			backendPort: Number.parseInt(s.backendPort, 10),
			backendUrl,
			frontendPort: Number.parseInt(s.frontendPort, 10),
			frontendUrl,
		});
	}

	const security = section('security');
	if (security) {
		Object.assign(security, {
			authCookieName: `${s.appSlug}_auth`,
			csrfCookieName: `${s.appSlug}_csrf`,
			refreshCookieName: `${s.appSlug}_refresh`,
		});
	}

	const database = section('database');
	if (database) database['url'] = `file:./data/${s.appSlug}.db`;

	const cors = section('cors');
	if (cors) cors['frontendDevOrigins'] = [frontendUrl];
}

export function createJsonConfig(s: SetupSettings, keys: SecurityKeys): void {
	const configDir = path.join(process.cwd(), 'config');
	const configPath = path.join(configDir, `${s.appSlug}.json`);
	const examplePath = path.join(configDir, 'example.json');
	const defaultsPath = path.join(process.cwd(), 'backend', 'src', 'config', 'defaults.json');

	if (!fs.existsSync(defaultsPath)) {
		console.log('⚠️  Warning: defaults.json not found, skipping JSON config creation');
		return;
	}

	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
		console.log(`✅ Created: ${configDir}/`);
	}

	const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<string, unknown>;
	applyBranding(defaults, s);

	const security = defaults['security'] as Record<string, unknown>;
	Object.assign(security, {
		applicationApiKey: keys.appApiKey,
		backupEncryptionKey: keys.backupEncryptionKey,
		cookieSecret: keys.cookieSecret,
		encryptionKey: keys.encryptionKey,
		jwtPrivateKey: keys.jwtKeyPair.privateKey,
		jwtPublicKey: keys.jwtKeyPair.publicKey,
		jwtRefreshPrivateKey: keys.jwtRefreshKeyPair.privateKey,
		jwtRefreshPublicKey: keys.jwtRefreshKeyPair.publicKey,
		mfaPrivateKey: keys.mfaKeyPair.privateKey,
		mfaPublicKey: keys.mfaKeyPair.publicKey,
	});

	// Dev instances ship with rate limiting off so crawltest / spernakit-tester
	// workflows don't trip the 429 cascade on rapid-fire navigation. Production
	// deployments should flip these back to true via SECRET_CONFIG_KEYS env-var
	// injection or manual config edit. defaults.json itself stays production-safe
	// (rateLimit.enabled=true) — the invariant check in check-config-invariants.ts
	// enforces that; this override only affects the generated instance file.
	const rateLimit = defaults['rateLimit'] as Record<string, unknown> | undefined;
	if (rateLimit) {
		rateLimit['enabled'] = false;
		rateLimit['authEnabled'] = false;
	}

	fs.writeFileSync(configPath, JSON.stringify(defaults, null, '\t'), 'utf8');
	console.log(`✅ Created: ${configPath}`);

	updateJsonFile(defaultsPath, (defaultsJson) => applyBranding(defaultsJson, s));
	updateJsonFile(examplePath, (exampleJson) => applyBranding(exampleJson, s));
}
