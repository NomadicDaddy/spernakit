#!/usr/bin/env bun
/** Branded workspace manifests must produce an app that accepts a frozen install. */
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installBrandedDependencies } from './lib/init/scaffold.ts';
import { updatePackageJsonFiles } from './lib/setup/file-updates.ts';
import { createChildEnv } from './lib/smoke/env.ts';

const fixture = mkdtempSync(join(tmpdir(), 'init-lockfile-branding-'));
const originalDirectory = process.cwd();

function writePackage(directory: string, value: Record<string, unknown>): void {
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, 'package.json'), `${JSON.stringify(value, null, '\t')}\n`);
}

function install(frozen: boolean): { code: number; output: string } {
	const result = Bun.spawnSync(
		[process.execPath, 'install', ...(frozen ? ['--frozen-lockfile'] : [])],
		{ cwd: fixture, env: createChildEnv(), stderr: 'pipe', stdout: 'pipe', timeout: 20_000 },
	);
	return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
}

try {
	writePackage(fixture, {
		name: 'spernakit',
		private: true,
		version: '3.48.1',
		workspaces: ['backend', 'frontend', 'shared'],
	});
	writePackage(join(fixture, 'backend'), {
		dependencies: { 'spernakit-shared': 'workspace:*' },
		name: 'spernakit-backend',
		private: true,
	});
	writePackage(join(fixture, 'frontend'), { name: 'spernakit-frontend', private: true });
	writePackage(join(fixture, 'shared'), { name: 'spernakit-shared', private: true });
	const initial = install(false);
	assert.equal(initial.code, 0, initial.output);
	const frozenBefore = install(true);
	assert.equal(frozenBefore.code, 0, frozenBefore.output);
	const originalLock = readFileSync(join(fixture, 'bun.lock'), 'utf8');

	process.chdir(fixture);
	updatePackageJsonFiles({
		appDescription: 'Synthetic workspace branding regression',
		appName: 'Branded Fixture',
		appSlug: 'branded-fixture',
		appVersion: '0.1.0',
		backendPort: '49781',
		frontendPort: '49780',
	});
	assert.equal(readFileSync(join(fixture, 'bun.lock'), 'utf8'), originalLock);
	const stale = install(true);
	assert.notEqual(stale.code, 0, 'branding without lock refresh must fail frozen install');
	assert.match(stale.output, /lockfile had changes/);

	installBrandedDependencies(fixture);
	const frozenAfter = install(true);
	assert.equal(frozenAfter.code, 0, frozenAfter.output);
	assert.notEqual(readFileSync(join(fixture, 'bun.lock'), 'utf8'), originalLock);
	console.log('[OK] Branded workspace lock rejects the stale control and accepts frozen install');
} finally {
	process.chdir(originalDirectory);
	rmSync(fixture, { force: true, recursive: true });
}
