#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadFleetManifest, validateFleetManifest } from './lib/fleet/manifest.ts';
import { readTemplateVersion } from './lib/init/scaffold.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, '\t')}\n`);
}

function expectThrow(run: () => void, expected: string): void {
	try {
		run();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		assert(message.includes(expected), `Expected "${expected}" in "${message}"`);
		return;
	}
	throw new Error(`Expected an error containing "${expected}"`);
}

function manifestText(templateVersion = '3.24.1'): string {
	return `@{
\tExpectedConfigs = @{
\t\t'spernakit' = @{
\t\t\tappName = 'Spernakit v3'
\t\t\tbackendPort = 3331
\t\t\tdescription = 'Application template'
\t\t\tfrontendPort = 3330
\t\t\tversion = '3.30.0'
\t\t}
\t\t'g5' = @{
\t\t\tappName = 'G5 Contingency Office'
\t\t\tbackendPort = 3431
\t\t\tdescription = 'Production system for fictional Candolian emergency briefings'
\t\t\tfrontendPort = 3430
\t\t\tspernakit_version = '${templateVersion}'
\t\t\tversion = '0.1.0'
\t\t}
\t}
}
`;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'spernakit-fleet-'));
const projectRoot = join(import.meta.dir, '..');
const templateRoot = join(fixtureRoot, 'spernakit');
const g5Root = join(fixtureRoot, 'g5');
const manifestPath = join(templateRoot, 'spernakit.psd1');
const g5PackagePath = join(g5Root, 'package.json');
const g5ConfigPath = join(g5Root, 'config', 'g5.json');

try {
	const exampleEntries = loadFleetManifest(join(projectRoot, 'spernakit.psd1.example'));
	assert(
		exampleEntries.length === 1 && exampleEntries[0]?.slug === 'spernakit',
		'Expected the tracked example to be a valid template-only manifest',
	);

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
	writeJson(join(g5Root, 'backend', 'src', 'config', 'defaults.json'), {
		app: { slug: 'g5' },
	});
	writeJson(g5PackagePath, {
		name: 'g5',
		spernakit_version: '3.24.1',
		version: '0.1.0',
	});
	writeJson(g5ConfigPath, {
		app: {
			description: 'Production system for fictional Candolian emergency briefings',
			name: 'G5 Contingency Office',
			slug: 'g5',
		},
		server: { backendPort: 3431, frontendPort: 3430 },
	});
	writeFileSync(manifestPath, manifestText());

	const entries = loadFleetManifest(manifestPath);
	assert(entries.length === 2, 'Expected both fixture entries to parse');
	assert(
		validateFleetManifest(entries, fixtureRoot).length === 0,
		'Expected a valid key-derived directory fixture',
	);

	writeFileSync(manifestPath, manifestText('latest'));
	expectThrow(() => loadFleetManifest(manifestPath), 'concrete semantic version');

	writeFileSync(
		manifestPath,
		manifestText().replace(
			"\t\t\tappName = 'G5 Contingency Office'\n",
			"\t\t\tappName = 'G5 Contingency Office'\n\t\t\tappSlug = 'g5'\n",
		),
	);
	expectThrow(() => loadFleetManifest(manifestPath), 'appSlug is not supported');

	writeFileSync(manifestPath, '@{ ExpectedConfigs = @{} }\n');
	expectThrow(() => loadFleetManifest(manifestPath), 'at least one entry');

	writeFileSync(manifestPath, manifestText());
	const validEntries = loadFleetManifest(manifestPath);
	writeJson(g5PackagePath, {
		spernakit_version: '3.24.1',
		version: '0.2.0',
	});
	assert(
		validateFleetManifest(validEntries, fixtureRoot).some((problem) =>
			problem.includes('g5.version'),
		),
		'Expected an app-version mismatch',
	);

	writeJson(g5PackagePath, {
		spernakit_version: '3.24.1',
		version: '0.1.0',
	});
	unlinkSync(g5ConfigPath);
	assert(
		validateFleetManifest(validEntries, fixtureRoot).some((problem) =>
			problem.includes('runtime config is missing'),
		),
		'Expected a missing runtime config failure',
	);

	writeJson(g5ConfigPath, {
		app: {
			description: 'Wrong description',
			name: 'G5 Contingency Office',
			slug: 'g5',
		},
		server: { backendPort: 3431, frontendPort: 3430 },
	});
	assert(
		validateFleetManifest(validEntries, fixtureRoot).some((problem) =>
			problem.includes('g5.description'),
		),
		'Expected a runtime-config mismatch',
	);

	const invalidSource = join(fixtureRoot, 'invalid-source');
	mkdirSync(invalidSource);
	writeJson(join(invalidSource, 'package.json'), {});
	expectThrow(() => readTemplateVersion(invalidSource), 'concrete version');
	writeJson(join(invalidSource, 'package.json'), { spernakit_version: 'latest' });
	expectThrow(() => readTemplateVersion(invalidSource), 'concrete semantic version');

	console.log(`[OK] Fleet manifest validator self-test passed (${checks} assertions).`);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
