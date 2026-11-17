#!/usr/bin/env bun
/**
 * Gate: deploy:local-prod writes a config its own production validator accepts
 * (`.aidd/features/remediation-20261108-local-prod-config-fails-production-validator`).
 *
 * The defect: the deployer defaulted security.cookieSecure to false, which the production
 * validator rejects as an error, so a first-run local-prod deploy died at startup validation.
 * The fix lives in the deployer only; the validator and the security schema are unchanged.
 *
 * Runs the real deployer into throwaway appdata/backups roots (--skip-image-check, so no Docker)
 * and puts each generated config through the same merge-and-validate path config:validate uses:
 *  1. The default (http://localhost) config has cookieSecure=true, a cookie secret, and no
 *     schema issues or error-level security issues.
 *  2. Rejection control: that same config with cookieSecure=false still fails validation on
 *     security.cookieSecure, so the validator was not weakened to make (1) pass.
 *  3. A rerun without --rotate-secrets leaves the existing config byte-identical, and a preserved
 *     config that still has cookieSecure=false is kept but draws a will-not-start warning.
 *  4. An HTTPS frontend URL and a 127.0.0.1 frontend URL are accepted and validate clean.
 *  5. A plain-HTTP frontend URL on a non-loopback host is refused and writes no config.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getAppSlug, loadDefaults } from '../backend/src/config/configUtils.ts';
import { validateMergedInstance } from './lib/config-validation.ts';

const root = resolve(import.meta.dir, '..');
const defaults = loadDefaults();
const slug = getAppSlug(defaults);

// Secret env vars would replace generated values during validation; strip them so the test sees
// exactly what the deployer wrote.
const envPrefix = `${slug.toUpperCase().replace(/-/g, '_')}_`;
for (const key of Object.keys(process.env)) {
	if (key.startsWith(envPrefix)) delete process.env[key];
}

// The deployer gets its roots from flags, so its child needs only what the OS and Bun need to run,
// on Windows and on the Linux CI runner (HOME for Bun, TMPDIR for the temp directory).
// Leaving out APPDATA_ROOT, BACKUPS_ROOT and every app secret proves the flags are what it uses.
const CHILD_ENV_KEYS = [
	'PATH',
	'Path',
	'PATHEXT',
	'SystemRoot',
	'windir',
	'ComSpec',
	'TEMP',
	'TMP',
	'HOME',
	'TMPDIR',
];
const childEnv: Record<string, string> = {};
for (const key of CHILD_ENV_KEYS) {
	const value = process.env[key];
	if (value !== undefined) childEnv[key] = value;
}

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

interface DeployRun {
	configPath: string;
	output: string;
	status: null | number;
	tempRoot: string;
}

function runDeployer(extraArgs: string[], tempRoot?: string): DeployRun {
	const base = tempRoot ?? mkdtempSync(join(tmpdir(), 'local-prod-config-'));
	const appdataRoot = join(base, 'appdata');
	const result = spawnSync(
		process.execPath,
		[
			'scripts/deploy-local-prod.ts',
			'--appdata-root',
			appdataRoot,
			'--backups-root',
			join(base, 'backups'),
			'--skip-image-check',
			...extraArgs,
		],
		{ cwd: root, encoding: 'utf8', env: childEnv },
	);
	return {
		configPath: join(appdataRoot, slug, 'config', `${slug}.json`),
		output: `${result.stdout}${result.stderr}`,
		status: result.status,
		tempRoot: base,
	};
}

function readConfig(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function errorFields(config: Record<string, unknown>): string[] {
	const validation = validateMergedInstance(defaults, config, slug);
	return [
		...validation.schemaIssues.map((issue) => `schema ${issue.path}: ${issue.message}`),
		...validation.securityIssues
			.filter((issue) => issue.level === 'error')
			.map((issue) => issue.field),
	];
}

function securityOf(config: Record<string, unknown>): Record<string, unknown> {
	return config['security'] as Record<string, unknown>;
}

function cleanup(run: DeployRun): void {
	// The deployer makes the config read-only, which blocks removal on Windows.
	if (existsSync(run.configPath)) chmodSync(run.configPath, 0o600);
	rmSync(run.tempRoot, { force: true, recursive: true });
}

const runs: DeployRun[] = [];
try {
	// 1. Default localhost deploy.
	const local = runDeployer([]);
	runs.push(local);
	assert(local.status === 0, `default deploy exits 0 (got ${local.status}): ${local.output}`);
	assert(existsSync(local.configPath), 'default deploy writes the config');
	if (existsSync(local.configPath)) {
		const config = readConfig(local.configPath);
		const security = securityOf(config);
		assert(security['cookieSecure'] === true, 'generated config sets cookieSecure=true');
		assert(
			typeof security['cookieSecret'] === 'string' && security['cookieSecret'].length > 0,
			'generated config carries a cookie secret',
		);
		const errors = errorFields(config);
		assert(
			errors.length === 0,
			`generated config passes production validation: ${errors.join(', ')}`,
		);

		// 2. Rejection control.
		const insecure = { ...config, security: { ...security, cookieSecure: false } };
		assert(
			errorFields(insecure).includes('security.cookieSecure'),
			'the same config with cookieSecure=false still fails on security.cookieSecure',
		);

		// 3. A rerun without --rotate-secrets keeps the operator's config.
		const before = readFileSync(local.configPath, 'utf8');
		const rerun = runDeployer([], local.tempRoot);
		assert(rerun.status === 0, `rerun exits 0 (got ${rerun.status}): ${rerun.output}`);
		assert(
			readFileSync(local.configPath, 'utf8') === before,
			'rerun leaves the config unchanged',
		);
		assert(!rerun.output.includes('cookieSecure=false'), 'a secure config draws no warning');

		// A preserved config from before the fix is kept, but the operator is told it cannot start.
		chmodSync(local.configPath, 0o600);
		const legacy = JSON.stringify(insecure, null, '\t');
		writeFileSync(local.configPath, legacy, 'utf8');
		const legacyRun = runDeployer([], local.tempRoot);
		assert(legacyRun.status === 0, `legacy rerun exits 0 (got ${legacyRun.status})`);
		assert(
			readFileSync(local.configPath, 'utf8') === legacy,
			'a preserved cookieSecure=false config is left as the operator wrote it',
		);
		assert(
			legacyRun.output.includes('cookieSecure=false'),
			'a preserved cookieSecure=false config draws the will-not-start warning',
		);
		const warning = legacyRun.output
			.split('\n')
			.find((line) => line.includes('cookieSecure=false'));
		assert(
			warning !== undefined && !warning.includes('--rotate-secrets'),
			'the warning offers only the hand edit, never the destructive --rotate-secrets',
		);

		// An unparsable kept config is still left alone, and the rerun still succeeds.
		const garbled = '{ not json';
		writeFileSync(local.configPath, garbled, 'utf8');
		const garbledRun = runDeployer([], local.tempRoot);
		assert(
			garbledRun.status === 0,
			`unparsable-config rerun exits 0 (got ${garbledRun.status})`,
		);
		assert(
			readFileSync(local.configPath, 'utf8') === garbled,
			'an unparsable kept config is left as it was',
		);
		assert(garbledRun.output.includes('not valid JSON'), 'the unparsable config is reported');
	}

	// 4. HTTPS and 127.0.0.1 frontend URLs.
	for (const url of ['https://app.example.test', 'http://127.0.0.1:3330']) {
		const run = runDeployer(['--frontend-url', url]);
		runs.push(run);
		assert(run.status === 0, `${url} deploy exits 0 (got ${run.status}): ${run.output}`);
		if (existsSync(run.configPath)) {
			const errors = errorFields(readConfig(run.configPath));
			assert(errors.length === 0, `${url} config validates clean: ${errors.join(', ')}`);
		}
	}

	// 5. Plain HTTP on a non-loopback host is refused before anything is written.
	const lan = runDeployer(['--frontend-url', 'http://app.example.test:3330']);
	runs.push(lan);
	assert(lan.status !== 0, 'a plain-HTTP non-loopback frontend URL is refused');
	assert(!existsSync(lan.configPath), 'the refused deploy writes no config');
	assert(lan.output.includes('loopback'), 'the refusal names the HTTPS-or-loopback rule');
} finally {
	for (const run of runs) cleanup(run);
}

if (failures.length > 0) {
	console.error(`[FAIL] test:deploy-local-prod-config (${failures.length})`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('[PASS] test:deploy-local-prod-config');
