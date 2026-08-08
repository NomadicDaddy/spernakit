#!/usr/bin/env bun
/**
 * Regression coverage for the docker-prod production-config preflight.
 *
 * Drives the same merged-config validator as config:validate with generated keys and one injected
 * placeholder, then pins the shipped smoke step order so no image work can precede the preflight.
 */
import { join } from 'node:path';

import { getConfigJsonSchema } from '../backend/src/config/configSchema.ts';
import { loadDefaults } from '../backend/src/config/configUtils.ts';
import {
	findMissingRequiredPaths,
	formatSecurityIssue,
	type JsonSchemaNode,
	parseNodeEnvironment,
	validateMergedInstance,
} from './lib/config-validation.ts';
import { generateEcKeyPair, generateHexKey, generateSecureKey } from './lib/crypto-keys.ts';

interface SmokeConfig {
	modes: Record<string, { steps: { command: string }[] }>;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function generatedConfig(): Record<string, unknown> {
	const config = structuredClone(loadDefaults());
	const security = config['security'];
	if (security === null || typeof security !== 'object' || Array.isArray(security)) {
		throw new Error('defaults security config is not an object');
	}

	const jwt = generateEcKeyPair();
	const refresh = generateEcKeyPair();
	const mfa = generateEcKeyPair();
	const values: Record<string, string> = {
		applicationApiKey: generateSecureKey(48),
		backupEncryptionKey: generateHexKey(32),
		cookieSecret: generateSecureKey(32),
		encryptionKey: generateHexKey(32),
		jwtPrivateKey: jwt.privateKey,
		jwtPublicKey: jwt.publicKey,
		jwtRefreshPrivateKey: refresh.privateKey,
		jwtRefreshPublicKey: refresh.publicKey,
		mfaPrivateKey: mfa.privateKey,
		mfaPublicKey: mfa.publicKey,
	};
	Object.assign(security, values);
	return config;
}

try {
	const production = parseNodeEnvironment('production');
	assert(
		production === 'production',
		'Expected --node-env production to select the production environment',
	);
	// The argument is what selects the production security checks, so a value outside the three
	// environments has to throw rather than fall back to development and pass a weaker run.
	let rejected = false;
	try {
		parseNodeEnvironment('prod');
	} catch {
		rejected = true;
	}
	assert(rejected, 'Expected an unrecognized --node-env value to be rejected');

	const defaults = loadDefaults();
	const configSchema = getConfigJsonSchema() as JsonSchemaNode;
	assert(
		findMissingRequiredPaths(defaults, configSchema).length === 0,
		'Expected defaults.json to contain every required config field explicitly',
	);
	const incomplete = structuredClone(defaults);
	delete (incomplete['databaseAdmin'] as Record<string, unknown>)['enabled'];
	assert(
		findMissingRequiredPaths(incomplete, configSchema).includes('databaseAdmin.enabled'),
		'Expected completeness validation to catch an omitted defaulted field',
	);
	const generated = generatedConfig();
	const originalNodeEnv = (generated['server'] as Record<string, unknown>)['nodeEnv'];
	const valid = validateMergedInstance(defaults, generated, 'preflight-fixture', production);
	assert(valid.schemaIssues.length === 0, 'Expected generated config to remain schema-valid');
	assert(
		valid.securityIssues.every((issue) => issue.level !== 'error'),
		`Expected generated config to pass the production placeholder preflight: ${JSON.stringify(valid)}`,
	);
	assert(
		(generated['server'] as Record<string, unknown>)['nodeEnv'] === originalNodeEnv,
		'Expected the production override not to mutate the source config',
	);

	const sentinel = 'PRODUCTION_CHANGE_REQUIRED-NEVER_PRINT_THIS_SECRET_VALUE_0123456789abcdef';
	const placeholder = structuredClone(generated);
	(placeholder['security'] as Record<string, unknown>)['backupEncryptionKey'] = sentinel;
	const invalid = validateMergedInstance(defaults, placeholder, 'preflight-fixture', production);
	const issue = invalid.securityIssues.find(
		(candidate) => candidate.field === 'security.backupEncryptionKey',
	);
	assert(issue?.level === 'error', 'Expected the placeholder field to fail in production mode');
	assert(
		issue?.message === 'placeholder value detected - run "bun run generate-keys"',
		'Expected the existing fixed remediation message',
	);
	const output = issue === undefined ? '' : formatSecurityIssue(issue);
	assert(output.includes('security.backupEncryptionKey'), 'Expected output to name the field');
	assert(output.includes('bun run generate-keys'), 'Expected output to name the repair command');
	assert(!output.includes(sentinel), 'Expected output not to disclose the placeholder value');

	const root = join(import.meta.dir, '..');
	const smoke = (await Bun.file(join(root, 'scripts/smoke.json')).json()) as SmokeConfig;
	const commands = smoke.modes['docker-prod']?.steps.map((step) => step.command);
	assert(commands !== undefined, 'Expected docker-prod smoke mode to exist');
	const expected = [
		'bun run config:validate -- --node-env production',
		'bun run docker:image:build',
		'bun run check:image-licenses',
		'bun scripts/reset-database.ts --force',
		'docker compose -f docker-compose.production.yml up -d',
		'bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000 --container {{APP_SLUG}}',
		'bun scripts/crawltest.ts --mode docker-prod',
		'bun run verify-compression --mode docker-prod',
		'docker compose -f docker-compose.production.yml down',
	];
	assert(
		JSON.stringify(commands) === JSON.stringify(expected),
		`Expected preflight first and the existing docker-prod order unchanged: ${JSON.stringify(commands)}`,
	);

	console.log(`Config production-preflight test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
