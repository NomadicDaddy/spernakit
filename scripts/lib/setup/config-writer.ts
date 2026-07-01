/**
 * Generates the instance JSON config (config/{slug}.json) and syncs
 * backend/src/config/defaults.json with the chosen settings.
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

export function createJsonConfig(s: SetupSettings, keys: SecurityKeys): void {
	const configDir = path.join(process.cwd(), 'config');
	const configPath = path.join(configDir, `${s.appSlug}.json`);
	const defaultsPath = path.join(process.cwd(), 'backend', 'src', 'config', 'defaults.json');
	const frontendUrl = `http://localhost:${s.frontendPort}`;
	const backendUrl = `http://localhost:${s.backendPort}`;
	const databaseUrl = `file:./data/${s.appSlug}.db`;

	if (!fs.existsSync(defaultsPath)) {
		console.log('⚠️  Warning: defaults.json not found, skipping JSON config creation');
		return;
	}

	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
		console.log(`✅ Created: ${configDir}/`);
	}

	const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<string, unknown>;
	const app = defaults['app'] as Record<string, unknown>;
	const server = defaults['server'] as Record<string, unknown>;
	const security = defaults['security'] as Record<string, unknown>;
	const database = defaults['database'] as Record<string, unknown>;
	const rateLimit = defaults['rateLimit'] as Record<string, unknown> | undefined;

	Object.assign(app, { description: s.appDescription, name: s.appName, slug: s.appSlug });
	Object.assign(server, {
		backendPort: Number.parseInt(s.backendPort, 10),
		backendUrl,
		frontendPort: Number.parseInt(s.frontendPort, 10),
		frontendUrl,
	});
	Object.assign(security, {
		applicationApiKey: keys.appApiKey,
		authCookieName: `${s.appSlug}_auth`,
		cookieSecret: keys.cookieSecret,
		csrfCookieName: `${s.appSlug}_csrf`,
		encryptionKey: keys.encryptionKey,
		jwtPrivateKey: keys.jwtKeyPair.privateKey,
		jwtPublicKey: keys.jwtKeyPair.publicKey,
		jwtRefreshPrivateKey: keys.jwtRefreshKeyPair.privateKey,
		jwtRefreshPublicKey: keys.jwtRefreshKeyPair.publicKey,
		refreshCookieName: `${s.appSlug}_refresh`,
	});
	database['url'] = databaseUrl;

	const cors = defaults['cors'] as Record<string, unknown> | undefined;
	if (cors) {
		cors['frontendDevOrigins'] = [frontendUrl];
	}

	// Dev instances ship with rate limiting off so crawltest / spernakit-tester
	// workflows don't trip the 429 cascade on rapid-fire navigation. Production
	// deployments should flip these back to true via SECRET_CONFIG_KEYS env-var
	// injection or manual config edit. defaults.json itself stays production-safe
	// (rateLimit.enabled=true) — the invariant check in check-config-invariants.ts
	// enforces that; this override only affects the generated instance file.
	if (rateLimit) {
		rateLimit['enabled'] = false;
		rateLimit['authEnabled'] = false;
	}

	fs.writeFileSync(configPath, JSON.stringify(defaults, null, '\t'), 'utf8');
	console.log(`✅ Created: ${configPath}`);

	updateJsonFile(defaultsPath, (defaultsJson) => {
		const dApp = defaultsJson['app'] as Record<string, unknown>;
		const dDatabase = defaultsJson['database'] as Record<string, unknown>;
		const dSecurity = defaultsJson['security'] as Record<string, unknown>;
		const dServer = defaultsJson['server'] as Record<string, unknown>;
		Object.assign(dApp, { description: s.appDescription, name: s.appName, slug: s.appSlug });
		Object.assign(dServer, {
			backendPort: Number.parseInt(s.backendPort, 10),
			backendUrl,
			frontendPort: Number.parseInt(s.frontendPort, 10),
			frontendUrl,
		});
		Object.assign(dSecurity, {
			authCookieName: `${s.appSlug}_auth`,
			csrfCookieName: `${s.appSlug}_csrf`,
			refreshCookieName: `${s.appSlug}_refresh`,
		});
		dDatabase['url'] = databaseUrl;
		const dCors = defaultsJson['cors'] as Record<string, unknown> | undefined;
		if (dCors) {
			dCors['frontendDevOrigins'] = [frontendUrl];
		}
	});
}
