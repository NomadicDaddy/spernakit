#!/usr/bin/env bun
/**
 * Spernakit Setup Script
 *
 * Generates JSON config file (config/{appname}.json) with secure keys
 * and customizes the application with your settings.
 *
 * Usage:
 *   bun run setup
 *   bun run setup --slug myapp --name "My App" --description "My custom app" --frontend-port 3330 --backend-port 3331
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { createJsonConfig, type SetupSettings } from './lib/setup/config-writer.ts';
import {
	updateBackendFiles,
	updateDockerFiles,
	updateFrontendFiles,
	updateMiscFiles,
	updatePackageJsonFiles,
} from './lib/setup/file-updates.ts';
import {
	readJsonObjectOrNull,
	readNumberFromObject,
	readStringFromObject,
} from './lib/setup/json-files.ts';
import { generateKeys } from './lib/setup/keys.ts';

interface Config {
	backendPort?: string;
	description?: string;
	frontendPort?: string;
	name?: string;
	slug?: string;
	version?: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
const config: Config = {};

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case '--backend-port':
			config.backendPort = args[++i]!;
			break;
		case '--description':
			config.description = args[++i]!;
			break;
		case '--frontend-port':
			config.frontendPort = args[++i]!;
			break;
		case '--help':
		case '-h':
			console.log(`\nUsage: bun run setup [options]\n`);
			console.log('Options:');
			console.log('  --slug <value>          Application slug (lowercase, no spaces)');
			console.log('  --name <value>           Application name');
			console.log('  --description <value>    Application description');
			console.log(
				'  --version <value>        Application version (default: keep current version)'
			);
			console.log('  --frontend-port <value>  Frontend port (default: 3330)');
			console.log('  --backend-port <value>   Backend port (default: 3331)');
			console.log('  --help, -h               Show this help message\n');
			process.exit(0);
			break;
		case '--name':
			config.name = args[++i]!;
			break;
		case '--slug':
			config.slug = args[++i]!;
			break;
		case '--version':
			config.version = args[++i]!;
			break;
		default:
			console.error(`Unknown option: ${args[i]}`);
			console.error('Use --help for usage information');
			process.exit(1);
	}
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function question(prompt: string, defaultValue?: string): Promise<string> {
	const promptWithDefault = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
	return new Promise((resolve) => {
		rl.question(promptWithDefault, (answer: string) => {
			resolve(answer || defaultValue || '');
		});
	});
}

function inferExistingPromptDefaults(): {
	backendPort?: string;
	description?: string;
	frontendPort?: string;
	name?: string;
	slug?: string;
	version?: string;
} {
	const defaultsPath = path.join(process.cwd(), 'backend', 'src', 'config', 'defaults.json');
	const defaultsJson = readJsonObjectOrNull(defaultsPath);
	const defaultsApp =
		defaultsJson && typeof defaultsJson['app'] === 'object' && defaultsJson['app'] !== null
			? (defaultsJson['app'] as Record<string, unknown>)
			: null;
	const slugFromDefaults = defaultsApp ? readStringFromObject(defaultsApp, 'slug') : undefined;
	const slugCandidate = config.slug ?? slugFromDefaults;
	if (!slugCandidate) {
		return {};
	}

	const configPath = path.join(process.cwd(), 'config', `${slugCandidate}.json`);
	const existingConfig = readJsonObjectOrNull(configPath);
	if (!existingConfig) {
		return { slug: slugCandidate };
	}

	const app =
		typeof existingConfig['app'] === 'object' && existingConfig['app'] !== null
			? (existingConfig['app'] as Record<string, unknown>)
			: null;
	const server =
		typeof existingConfig['server'] === 'object' && existingConfig['server'] !== null
			? (existingConfig['server'] as Record<string, unknown>)
			: null;

	const frontendPort = server ? readNumberFromObject(server, 'frontendPort') : undefined;
	const backendPort = server ? readNumberFromObject(server, 'backendPort') : undefined;

	const result: {
		backendPort?: string;
		description?: string;
		frontendPort?: string;
		name?: string;
		slug?: string;
		version?: string;
	} = {};

	const description = app ? readStringFromObject(app, 'description') : undefined;
	const name = app ? readStringFromObject(app, 'name') : undefined;
	const slug = app ? readStringFromObject(app, 'slug') : undefined;
	const version = app ? readStringFromObject(app, 'version') : undefined;

	if (backendPort !== undefined) {
		result.backendPort = String(backendPort);
	}
	if (description !== undefined) {
		result.description = description;
	}
	if (frontendPort !== undefined) {
		result.frontendPort = String(frontendPort);
	}
	if (name !== undefined) {
		result.name = name;
	}
	result.slug = slug ?? slugCandidate;
	if (version !== undefined) {
		result.version = version;
	}

	return result;
}

async function collectSettings(): Promise<SetupSettings> {
	const inferredDefaults = inferExistingPromptDefaults();
	return {
		appDescription:
			config.description ||
			(await question('📝 Application description', inferredDefaults.description)),
		appName: config.name || (await question('📝 Application name', inferredDefaults.name)),
		appSlug:
			config.slug ||
			(await question('📝 Application slug (lowercase, no spaces)', inferredDefaults.slug)),
		appVersion:
			config.version ||
			(await question('📝 Application version', inferredDefaults.version ?? '1.0.0')),
		backendPort:
			config.backendPort ||
			(await question('🔧 Backend port', inferredDefaults.backendPort ?? '3331')),
		frontendPort:
			config.frontendPort ||
			(await question('🌐 Frontend port', inferredDefaults.frontendPort ?? '3330')),
	};
}

function runVerification(): void {
	console.log('\n🔍 Verifying application checks (check-application)...');
	try {
		execSync('bun run check-application', { stdio: 'inherit' });
		console.log('✅ check-application passed.');
	} catch {
		console.error('❌ check-application failed.');
		process.exit(1);
	}
}

function printSummary(s: SetupSettings): void {
	console.log('\n🎉 Setup complete!');
	console.log('\n📋 Configuration:');
	console.log(`   Config file: config/${s.appSlug}.json`);
	console.log('\nNext steps:');
	console.log('1. bun install                # Install dependencies');
	console.log('2. bun run db:setup           # Initialize database');
	console.log('3. bun run dev                # Start development server');
	console.log('\nYour application will be available at:');
	console.log(`- Frontend: http://localhost:${s.frontendPort}`);
	console.log(`- Backend:  http://localhost:${s.backendPort}`);
	console.log(`\n💡 Tip: Edit config/${s.appSlug}.json to customize your application`);
}

async function main(): Promise<void> {
	console.log('🚀 Spernakit Setup\n');
	console.log('This script will help you customize your new application.\n');

	const settings = await collectSettings();

	console.log('\n🔐 Generating security keys...');
	const keys = generateKeys();

	console.log('\n📁 Updating configuration files...');

	createJsonConfig(settings, keys);
	updatePackageJsonFiles(settings);
	updateBackendFiles(settings);
	updateFrontendFiles(settings);
	updateDockerFiles(settings);
	updateMiscFiles(settings);

	const dbDir = 'data';
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
		console.log(`✅ Created: ${dbDir}/`);
	}

	printSummary(settings);
	runVerification();

	rl.close();
}

main().catch((error: unknown) => {
	console.error('❌ Setup failed:', error);
	process.exit(1);
});
