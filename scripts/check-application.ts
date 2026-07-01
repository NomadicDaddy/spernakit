#!/usr/bin/env bun
/**
 * Application consistency checker for Spernakit v3.
 *
 * Validates:
 * - Config file exists and is valid JSON with required fields
 * - Database files are only in data/ (architectural constraint)
 * - Package.json files have correct names and workspaces
 * - No unauthorized .db files outside data/
 * - No rogue data/ or backup/ folders outside root (architectural constraint)
 * - No .env files in repository root (JSON-only config policy)
 */
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkCspHashConsistency } from './lib/check-application/csp-hash.ts';
import { findDbFiles, findRogueFolders } from './lib/check-application/fs-scans.ts';
import {
	assertDefined,
	assertEqual,
	isRecord,
	normalizeRelPath,
	readJsonFileOrThrow,
	readString,
} from './lib/check-application/json-utils.ts';
import {
	checkNoCommittedSecrets,
	checkNoEnvFiles,
} from './lib/check-application/secrets-policy.ts';
import { loadJsonConfig } from './load-json-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = path.resolve(path.join(__dirname, '..'));

type AppConfig = {
	app?: {
		description?: string;
		name?: string;
		slug?: string;
	};
	database?: {
		url?: string;
	};
	security?: {
		authCookieName?: string;
		csrfCookieName?: string;
		refreshCookieName?: string;
	};
	server?: {
		backendPort?: number;
		backendUrl?: string;
		frontendPort?: number;
		frontendUrl?: string;
	};
};

function checkConfigConsistency(): {
	backendPort: number;
	frontendPort: number;
	slug: string;
} {
	const { appSlug } = loadJsonConfig(repoRoot);
	const configDir = process.env['CONFIG_DIR'] || path.join(repoRoot, 'config');
	const configPath = path.join(configDir, `${appSlug}.json`);

	if (!fs.existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}

	const configUnknown = readJsonFileOrThrow(configPath);
	if (!isRecord(configUnknown)) {
		throw new Error(`Config file is not an object: ${configPath}`);
	}

	const config = configUnknown as AppConfig;

	const slug = assertDefined('config: app.slug', config.app?.slug);
	assertDefined('config: app.name', config.app?.name);
	assertDefined('config: app.description', config.app?.description);
	const frontendPort = assertDefined('config: server.frontendPort', config.server?.frontendPort);
	const backendPort = assertDefined('config: server.backendPort', config.server?.backendPort);
	const frontendUrl = assertDefined('config: server.frontendUrl', config.server?.frontendUrl);
	const backendUrl = assertDefined('config: server.backendUrl', config.server?.backendUrl);
	const databaseUrl = assertDefined('config: database.url', config.database?.url);

	assertEqual('config.server.frontendUrl', frontendUrl, `http://localhost:${frontendPort}`);
	assertEqual('config.server.backendUrl', backendUrl, `http://localhost:${backendPort}`);
	assertEqual('config.database.url', databaseUrl, `file:./data/${slug}.db`);

	const authCookieName = assertDefined(
		'config: security.authCookieName',
		config.security?.authCookieName
	);
	const csrfCookieName = assertDefined(
		'config: security.csrfCookieName',
		config.security?.csrfCookieName
	);
	const refreshCookieName = assertDefined(
		'config: security.refreshCookieName',
		config.security?.refreshCookieName
	);
	assertEqual('config.security.authCookieName', authCookieName, `${slug}_auth`);
	assertEqual('config.security.csrfCookieName', csrfCookieName, `${slug}_csrf`);
	assertEqual('config.security.refreshCookieName', refreshCookieName, `${slug}_refresh`);

	return { backendPort, frontendPort, slug };
}

function checkPackageJsonFiles(slug: string): void {
	const rootPkgPath = path.join(repoRoot, 'package.json');
	const rootPkgUnknown = readJsonFileOrThrow(rootPkgPath);
	if (!isRecord(rootPkgUnknown)) {
		throw new Error(`package.json is not an object: ${rootPkgPath}`);
	}

	assertEqual('package.json name', readString(rootPkgUnknown, 'name'), slug);

	const workspaces = rootPkgUnknown['workspaces'];
	if (!Array.isArray(workspaces)) {
		throw new Error('package.json missing workspaces array');
	}
	if (!workspaces.includes('backend') || !workspaces.includes('frontend')) {
		throw new Error('package.json workspaces must include backend and frontend');
	}

	assertEqual('package.json type', readString(rootPkgUnknown, 'type'), 'module');

	// Check workspace package.json files
	const backendPkgPath = path.join(repoRoot, 'backend', 'package.json');
	if (fs.existsSync(backendPkgPath)) {
		const backendPkg = readJsonFileOrThrow(backendPkgPath);
		if (isRecord(backendPkg)) {
			assertEqual(
				'backend/package.json name',
				readString(backendPkg, 'name'),
				`${slug}-backend`
			);
			assertEqual('backend/package.json type', readString(backendPkg, 'type'), 'module');
		}
	}

	const frontendPkgPath = path.join(repoRoot, 'frontend', 'package.json');
	if (fs.existsSync(frontendPkgPath)) {
		const frontendPkg = readJsonFileOrThrow(frontendPkgPath);
		if (isRecord(frontendPkg)) {
			assertEqual(
				'frontend/package.json name',
				readString(frontendPkg, 'name'),
				`${slug}-frontend`
			);
			assertEqual('frontend/package.json type', readString(frontendPkg, 'type'), 'module');
		}
	}
}

async function checkDatabaseLocation(slug: string): Promise<void> {
	console.log('   Checking for unauthorized database files...');
	const dbFiles = await findDbFiles(repoRoot);

	const unauthorizedFiles = dbFiles.filter((file) => {
		return normalizeRelPath(file) !== `data/${slug}.db`;
	});

	if (unauthorizedFiles.length > 0) {
		console.error('   Unauthorized database files detected:');
		for (const file of unauthorizedFiles) {
			console.error(`     ${file}`);
		}
		throw new Error(
			`Database files should only exist at data/${slug}.db. Found unauthorized files.`
		);
	}

	console.log('   No unauthorized database files found.');
}

async function checkRogueFolders(): Promise<void> {
	console.log('   Checking for rogue data/ or backup/ folders...');
	const rogueFolders = await findRogueFolders(repoRoot);

	if (rogueFolders.length > 0) {
		console.error('   Rogue data/ or backup/ folders detected (restricted to root only):');
		for (const folder of rogueFolders) {
			console.error(`     ${folder}`);
		}
		throw new Error(
			`data/ and backup/ folders are restricted to root only. Found rogue folders at: ${rogueFolders.join(', ')}`
		);
	}

	console.log('   No rogue data/ or backup/ folders found.');
}

async function main(): Promise<void> {
	try {
		console.log('Checking application configuration...');
		console.log('');

		console.log('   Checking config consistency...');
		const { backendPort, frontendPort, slug } = checkConfigConsistency();
		console.log(`   APP_SLUG: ${slug}`);
		console.log(`   BACKEND_PORT: ${backendPort}`);
		console.log(`   FRONTEND_PORT: ${frontendPort}`);
		console.log('');

		console.log('   Checking package.json files...');
		checkPackageJsonFiles(slug);
		console.log('');

		await checkDatabaseLocation(slug);
		console.log('');

		await checkRogueFolders();
		console.log('');

		checkNoEnvFiles(repoRoot);
		console.log('');

		checkNoCommittedSecrets(repoRoot);
		console.log('');

		checkCspHashConsistency(repoRoot);
		console.log('');

		console.log('Application checks passed.');
		process.exit(0);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(`Application check failed: ${typedErr.message}`);
		process.exit(1);
	}
}

main();
