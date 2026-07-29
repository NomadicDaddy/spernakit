#!/usr/bin/env bun
/**
 * Drives the shipped fleet-manifest writer against a real two-app fixture.
 *
 * Every case runs `scripts/sync-fleet-manifest.ts` and `scripts/check-fleet-manifest.ts` as
 * processes, so the CLI wiring, the PowerShell round trip, and the refusal exit codes are all
 * exercised the way the release path exercises them.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, '\t')}\n`);
}

function decode(output: Uint8Array | undefined): string {
	return output === undefined ? '' : new TextDecoder().decode(output);
}

const projectRoot = join(import.meta.dir, '..');

function run(script: string, appRoot: string): { code: number; output: string } {
	const result = Bun.spawnSync(['bun', join(projectRoot, 'scripts', script)], {
		cwd: appRoot,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return { code: result.exitCode, output: `${decode(result.stdout)}${decode(result.stderr)}` };
}

const MANIFEST = `# Spernakit fleet manifest
#
# Field semantics:
#   version             — App-owned semver (independent of the template version)
@{
\tExpectedConfigs = @{
\t\t'spernakit' = @{
\t\t\tappName      = 'Spernakit v3'
\t\t\tbackendPort  = 3331
\t\t\tdescription  = 'Application template'
\t\t\tfrontendPort = 3330
\t\t\tversion      = '3.30.0'
\t\t}
\t\t'g5'        = @{
\t\t\tappName           = 'G5 Contingency Office'
\t\t\tbackendPort       = 3431
\t\t\tdescription       = "Fictional Candolian briefings"
\t\t\tfrontendPort      = 3430
\t\t\tspernakit_version = '3.24.1'
\t\t\tversion           = '0.1.0'
\t\t}
\t}
}
`;

const SYNCED = MANIFEST.replace('backendPort       = 3431', 'backendPort       = 3441')
	.replace('frontendPort      = 3430', 'frontendPort      = 3440')
	.replace("spernakit_version = '3.24.1'", "spernakit_version = '3.31.2'")
	.replace("version           = '0.1.0'", "version           = '0.2.0'");

const fixtureRoot = mkdtempSync(join(tmpdir(), 'spernakit-fleet-sync-'));
const templateRoot = join(fixtureRoot, 'spernakit');
const g5Root = join(fixtureRoot, 'g5');
const manifestPath = join(templateRoot, 'spernakit.psd1');
const g5PackagePath = join(g5Root, 'package.json');
const g5ConfigPath = join(g5Root, 'config', 'g5.json');

function g5Package(): void {
	writeJson(g5PackagePath, { name: 'g5', spernakit_version: '3.31.2', version: '0.2.0' });
}

function g5Config(backendPort = 3441): void {
	writeJson(g5ConfigPath, {
		app: {
			description: 'Fictional Candolian briefings',
			name: 'G5 Contingency Office',
			slug: 'g5',
		},
		server: { backendPort, frontendPort: 3440 },
	});
}

function manifestText(): string {
	return readFileSync(manifestPath, 'utf8');
}

try {
	mkdirSync(join(templateRoot, 'config'), { recursive: true });
	mkdirSync(join(templateRoot, 'backend', 'src', 'config'), { recursive: true });
	mkdirSync(join(g5Root, 'config'), { recursive: true });
	mkdirSync(join(g5Root, 'backend', 'src', 'config'), { recursive: true });
	writeJson(join(templateRoot, 'package.json'), { version: '3.30.0' });
	writeJson(join(templateRoot, 'backend', 'src', 'config', 'defaults.json'), {
		app: { slug: 'spernakit' },
	});
	writeJson(join(templateRoot, 'config', 'spernakit.json'), {
		app: { description: 'Application template', name: 'Spernakit v3', slug: 'spernakit' },
		server: { backendPort: 3331, frontendPort: 3330 },
	});
	writeJson(join(g5Root, 'backend', 'src', 'config', 'defaults.json'), { app: { slug: 'g5' } });
	g5Package();
	g5Config();
	writeFileSync(manifestPath, MANIFEST);

	// The stale manifest is exactly the shape the 2026-07-27 dance left behind: an app version and a
	// spernakit_version that lag the app, plus a port pair the app has since moved.
	const stale = run('check-fleet-manifest.ts', templateRoot);
	assert(stale.code === 1, 'Expected the checker to fail against a stale manifest');
	assert(
		stale.output.includes('package.json and config/<slug>.json are authoritative'),
		'Expected the checker to name the authoritative sources',
	);
	assert(
		stale.output.includes('bun run fleet-manifest:sync'),
		'Expected the checker to name the repair command',
	);

	const synced = run('sync-fleet-manifest.ts', templateRoot);
	assert(synced.code === 0, `Expected the sync to succeed; got: ${synced.output}`);
	assert(
		synced.output.includes("g5.version: '0.1.0' -> '0.2.0'") &&
			synced.output.includes("g5.spernakit_version: '3.24.1' -> '3.31.2'") &&
			synced.output.includes('g5.backendPort: 3431 -> 3441') &&
			synced.output.includes('g5.frontendPort: 3430 -> 3440'),
		`Expected every stale value to be reported; got: ${synced.output}`,
	);
	assert(
		manifestText() === SYNCED,
		'Expected only the stale scalars to change, with header, order, and alignment preserved',
	);
	assert(
		manifestText().startsWith('# Spernakit fleet manifest\n'),
		'Expected the comment header to survive the rewrite',
	);
	assert(
		manifestText().includes('description       = "Fictional Candolian briefings"'),
		'Expected an unchanged value to keep its original quoting style',
	);

	const verified = run('check-fleet-manifest.ts', templateRoot);
	assert(
		verified.code === 0,
		`Expected the checker to pass after a sync; got: ${verified.output}`,
	);

	const repeat = run('sync-fleet-manifest.ts', templateRoot);
	assert(repeat.code === 0, 'Expected a second sync to succeed');
	assert(repeat.output.includes('already matches'), 'Expected the second sync to be a no-op');
	assert(manifestText() === SYNCED, 'Expected a no-op sync to leave the file byte-identical');

	// A port pair the app moved onto another app's port would produce an invalid manifest. The
	// candidate is validated before it replaces the real file, so nothing is written.
	g5Config(3331);
	const collision = run('sync-fleet-manifest.ts', templateRoot);
	assert(collision.code === 1, 'Expected a port collision to refuse the write');
	assert(
		collision.output.includes('duplicates port 3331'),
		`Expected the collision to be named; got: ${collision.output}`,
	);
	assert(manifestText() === SYNCED, 'Expected a refused write to leave the manifest untouched');
	g5Config();

	// An app with no runtime config cannot be verified, so the whole fleet write is refused rather
	// than the entry being written from package data alone or dropped.
	unlinkSync(g5ConfigPath);
	const unverifiable = run('sync-fleet-manifest.ts', templateRoot);
	assert(unverifiable.code === 1, 'Expected a missing runtime config to refuse the write');
	assert(
		unverifiable.output.includes('runtime config is missing') &&
			unverifiable.output.includes('unverifiable'),
		`Expected the entry to be reported unverifiable; got: ${unverifiable.output}`,
	);
	assert(
		manifestText() === SYNCED,
		'Expected an unverifiable entry to leave the manifest untouched',
	);
	g5Config();

	writeFileSync(g5PackagePath, '{ "version": ');
	const unreadable = run('sync-fleet-manifest.ts', templateRoot);
	assert(unreadable.code === 1, 'Expected an unreadable package.json to refuse the write');
	assert(
		unreadable.output.includes('package.json is unreadable'),
		`Expected the unreadable package to be named; got: ${unreadable.output}`,
	);
	assert(
		manifestText() === SYNCED,
		'Expected an unreadable package to leave the manifest untouched',
	);
	g5Package();

	writeJson(g5PackagePath, { name: 'g5', spernakit_version: 'latest', version: '0.2.0' });
	const nonSemver = run('sync-fleet-manifest.ts', templateRoot);
	assert(nonSemver.code === 1, 'Expected a non-semver spernakit_version to refuse the write');
	assert(
		nonSemver.output.includes('concrete semantic version'),
		`Expected the version to be rejected; got: ${nonSemver.output}`,
	);
	g5Package();

	rmSync(g5Root, { force: true, recursive: true });
	const missing = run('sync-fleet-manifest.ts', templateRoot);
	assert(missing.code === 1, 'Expected a missing app directory to refuse the write');
	assert(
		missing.output.includes('g5 directory is missing'),
		`Expected the missing directory to be named; got: ${missing.output}`,
	);
	assert(manifestText() === SYNCED, 'Expected a missing app to leave the manifest untouched');

	console.log(`[OK] Fleet manifest sync self-test passed (${checks} assertions).`);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
