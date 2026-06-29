#!/usr/bin/env bun
/**
 * Bootstrap a self-contained, locally-hosted production deployment.
 *
 * Distinct from smoke (test) and staging — pre-authors the config (with crypto
 * secrets) so the container's first-boot bootstrap path is skipped entirely.
 * Production deploys provision config explicitly, not by synthesizing it from
 * defaults inside the container.
 *
 * Usage:
 *   bun scripts/deploy-local-prod.ts [options]
 *
 * Options:
 *   --frontend-url <url>     Browser-facing URL (default: http://localhost:<frontend-port>)
 *   --allowed-origins <csv>  Comma-separated CORS origins (default: <frontend-url>)
 *   --frontend-port <n>      Host port for nginx (default: 3330)
 *   --backend-port <n>       Internal backend port (default: 3331)
 *   --cookie-secure          Set security.cookieSecure=true (requires HTTPS frontendUrl)
 *   --appdata-root <path>    Host path for persistent data
 *                            (default Windows: D:/appdata/production, Linux: /opt/appdata)
 *   --backups-root <path>    Host path for backups
 *                            (default Windows: D:/backups/production, Linux: /opt/backups)
 *   --rotate-secrets         Regenerate secrets even if config exists (DESTRUCTIVE)
 *   --skip-image-check       Don't verify the image exists in the registry
 *   --up                     Run `docker compose --env-file compose.vars pull && up -d`
 *                            after scaffolding
 */
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { generateEcKeyPair, generateHexKey, generateSecureKey } from './lib/crypto-keys.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface DefaultsJson {
	[section: string]: unknown;
	app: { slug: string };
	cors: Record<string, unknown>;
	security: Record<string, unknown>;
	server: Record<string, unknown>;
}

interface PackageJson {
	version: string;
}

const defaults = JSON.parse(
	readFileSync(join(projectRoot, 'backend/src/config/defaults.json'), 'utf8')
) as DefaultsJson;
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as PackageJson;

const APP_SLUG = defaults.app.slug;
const APP_VERSION = pkg.version;

const { values } = parseArgs({
	options: {
		'allowed-origins': { type: 'string' },
		'appdata-root': { type: 'string' },
		'backend-port': { default: '3331', type: 'string' },
		'backups-root': { type: 'string' },
		'cookie-secure': { default: false, type: 'boolean' },
		'frontend-port': { default: '3330', type: 'string' },
		'frontend-url': { type: 'string' },
		'rotate-secrets': { default: false, type: 'boolean' },
		'skip-image-check': { default: false, type: 'boolean' },
		up: { default: false, type: 'boolean' },
	},
});

const frontendPort = Number(values['frontend-port']);
const backendPort = Number(values['backend-port']);
if (!Number.isFinite(frontendPort) || !Number.isFinite(backendPort)) {
	console.error('❌ --frontend-port and --backend-port must be integers');
	process.exit(1);
}

const frontendUrl = values['frontend-url'] ?? `http://localhost:${frontendPort}`;
const allowedOrigins = (values['allowed-origins'] ?? frontendUrl)
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const cookieSecure = values['cookie-secure'];

const isWindows = process.platform === 'win32';
const appdataRoot =
	values['appdata-root'] ?? (isWindows ? 'D:/appdata/production' : '/opt/appdata');
const backupsRoot =
	values['backups-root'] ?? (isWindows ? 'D:/backups/production' : '/opt/backups');

const deployDir = join(appdataRoot, APP_SLUG);
const configDir = join(deployDir, 'config');
const configPath = join(configDir, `${APP_SLUG}.json`);
const dataDir = join(deployDir, 'data');
const logsDir = join(deployDir, 'logs');
const backupsDir = join(backupsRoot, APP_SLUG);
const composeSrc = join(projectRoot, 'docker-compose.production.yml');
const composeDest = join(deployDir, 'docker-compose.yml');
const composeVarsPath = join(deployDir, 'compose.vars');

if (!existsSync(composeSrc)) {
	console.error(`❌ docker-compose.production.yml not found at ${composeSrc}`);
	process.exit(1);
}

console.log(`Bootstrapping local-prod deploy of ${APP_SLUG}@${APP_VERSION}`);
console.log(`  appdata:   ${deployDir}`);
console.log(`  backups:   ${backupsDir}`);
console.log(`  frontend:  ${frontendUrl}`);
console.log(`  origins:   ${allowedOrigins.join(', ')}`);
console.log(
	`  cookieSec: ${cookieSecure}${
		cookieSecure ? '' : ' (insecure — only acceptable behind a TLS proxy)'
	}`
);

if (cookieSecure && !frontendUrl.startsWith('https://')) {
	console.error(
		`❌ --cookie-secure requires an HTTPS frontendUrl, got ${frontendUrl}. ` +
			`Front the deploy with a TLS proxy (Caddy + mkcert) and pass --frontend-url https://...`
	);
	process.exit(1);
}
if (!cookieSecure && frontendUrl.startsWith('https://')) {
	console.warn(
		'⚠ frontendUrl is HTTPS but --cookie-secure not set — auth cookies will not be sent.'
	);
}

if (!values['skip-image-check']) {
	const image = `ghcr.io/nomadicdaddy/${APP_SLUG}:${APP_VERSION}`;
	console.log(`\nChecking image exists: ${image}`);
	const inspect = spawnSync('docker', ['manifest', 'inspect', image], {
		shell: true,
		stdio: 'pipe',
	});
	if (inspect.status !== 0) {
		console.error(
			`❌ ${image} not found in the registry. Push it first ` +
				`(bun scripts/docker-image.ts push) or pass --skip-image-check.`
		);
		process.exit(1);
	}
	console.log('  ✓ image present');
}

mkdirSync(configDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
mkdirSync(backupsDir, { recursive: true });
console.log('\n✓ Directory tree ready');

const composeVarsContent = [
	`# Generated by scripts/deploy-local-prod.ts — edit APP_VERSION to upgrade.`,
	`APP_SLUG=${APP_SLUG}`,
	`APP_VERSION=${APP_VERSION}`,
	`FRONTEND_PORT=${frontendPort}`,
	`BACKEND_PORT=${backendPort}`,
	`APPDATA_ROOT=${appdataRoot}`,
	`BACKUPS_ROOT=${backupsRoot}`,
	`NODE_ENV=production`,
	'',
].join('\n');
writeFileSync(composeVarsPath, composeVarsContent);
console.log(`✓ Wrote ${composeVarsPath}`);

copyFileSync(composeSrc, composeDest);
console.log(`✓ Wrote ${composeDest}`);

if (existsSync(configPath) && !values['rotate-secrets']) {
	console.log(
		`\n✓ Config already exists at ${configPath} — leaving as-is ` +
			`(use --rotate-secrets to regenerate).`
	);
} else {
	if (existsSync(configPath)) {
		console.log(`\n⚠ --rotate-secrets: overwriting existing config at ${configPath}`);
	}

	const config = JSON.parse(JSON.stringify(defaults)) as DefaultsJson;
	const security = config.security as Record<string, unknown>;
	const server = config.server as Record<string, unknown>;
	const cors = config.cors as Record<string, unknown>;

	const jwt = generateEcKeyPair();
	const refresh = generateEcKeyPair();
	const mfa = generateEcKeyPair();
	security['jwtPrivateKey'] = jwt.privateKey;
	security['jwtPublicKey'] = jwt.publicKey;
	security['jwtRefreshPrivateKey'] = refresh.privateKey;
	security['jwtRefreshPublicKey'] = refresh.publicKey;
	security['mfaPrivateKey'] = mfa.privateKey;
	security['mfaPublicKey'] = mfa.publicKey;
	security['encryptionKey'] = generateHexKey(32);
	security['backupEncryptionKey'] = generateHexKey(32);
	security['cookieSecret'] = generateSecureKey(32);
	security['applicationApiKey'] = generateSecureKey(48);
	security['cookieSecure'] = cookieSecure;

	server['nodeEnv'] = 'production';
	server['frontendUrl'] = frontendUrl;
	server['frontendPort'] = frontendPort;
	server['backendPort'] = backendPort;
	server['backendUrl'] = `http://localhost:${backendPort}`;
	server['trustProxy'] = true;
	server['trustedProxies'] = ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'];

	cors['allowedOrigins'] = allowedOrigins;
	cors['frontendDevOrigins'] = [];
	cors['inheritFrontendUrl'] = false;

	writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
	try {
		chmodSync(configPath, 0o400);
	} catch {
		// chmod is a no-op on Windows bind mounts; container entrypoint re-applies on first read.
	}
	console.log(`✓ Wrote ${configPath} (production-authored, secrets generated)`);
}

console.log('\nNext steps:');
console.log(`  cd ${deployDir}`);
console.log(`  docker compose --env-file compose.vars pull`);
console.log(`  docker compose --env-file compose.vars up -d`);
console.log(`  docker compose --env-file compose.vars logs -f`);
console.log(`\nApp will be reachable at ${frontendUrl}`);

if (values.up) {
	console.log('\n--up: pulling and starting now...');
	const pull = spawnSync('docker', ['compose', '--env-file', 'compose.vars', 'pull'], {
		cwd: deployDir,
		shell: true,
		stdio: 'inherit',
	});
	if (pull.status !== 0) process.exit(pull.status ?? 1);
	const up = spawnSync('docker', ['compose', '--env-file', 'compose.vars', 'up', '-d'], {
		cwd: deployDir,
		shell: true,
		stdio: 'inherit',
	});
	if (up.status !== 0) process.exit(up.status ?? 1);
	console.log('\n✓ Container started. Tail logs with:');
	console.log(`  docker compose --env-file ${composeVarsPath} -f ${composeDest} logs -f`);
}
