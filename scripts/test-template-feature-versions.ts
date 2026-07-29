#!/usr/bin/env bun
/**
 * Real-CLI regression for the template feature ownership-marker guard.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'template-feature-versions-'));

function write(relativePath: string, content: string): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

function writeJson(relativePath: string, value: unknown): void {
	write(relativePath, `${JSON.stringify(value, null, '\t')}\n`);
}

function runCheck(): RunResult {
	const result = Bun.spawnSync(
		['bun', 'run', 'check:template-feature-versions', '--', '--project-dir', fixtureRoot],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

try {
	writeJson('package.json', { name: 'derived-app' });
	writeJson('.aidd/features/app-owned/feature.json', { id: 'app-owned' });
	let result = runCheck();
	assert(result.exitCode === 0, `A derived app must skip:\n${result.output}`);
	assert(
		result.output.includes('not applicable') &&
			result.output.includes('app-owned features may omit spernakit_version'),
		`A derived-app skip must explain why markers are optional:\n${result.output}`,
	);

	rmSync(join(fixtureRoot, '.aidd'), { force: true, recursive: true });
	writeJson('package.json', { name: 'spernakit' });
	result = runCheck();
	assert(result.exitCode === 0, `A published clone without .aidd must skip:\n${result.output}`);
	assert(
		result.output.includes('.aidd/features/ is absent'),
		`The published-clone skip must name the absent metadata:\n${result.output}`,
	);

	writeJson('.aidd/features/alpha/feature.json', { id: 'alpha' });
	writeJson('.aidd/features/beta/feature.json', { id: 'beta' });
	writeJson('.aidd/features/gamma/feature.json', {
		id: 'gamma',
		spernakit_version: '3.32.0',
	});
	result = runCheck();
	assert(result.exitCode !== 0, `Missing markers must fail:\n${result.output}`);
	assert(
		result.output.includes('.aidd/features/alpha/feature.json') &&
			result.output.includes('.aidd/features/beta/feature.json'),
		`The failure must name every missing marker:\n${result.output}`,
	);
	assert(
		result.output.includes('2 missing') && result.output.includes('3 feature records'),
		`The failure must report missing and examined counts:\n${result.output}`,
	);

	writeJson('.aidd/features/alpha/feature.json', {
		id: 'alpha',
		spernakit_version: '',
	});
	writeJson('.aidd/features/beta/feature.json', {
		id: 'beta',
		spernakit_version: '3.31.2',
	});
	result = runCheck();
	assert(result.exitCode !== 0, `An invalid marker must fail:\n${result.output}`);
	assert(
		result.output.includes('.aidd/features/alpha/feature.json') &&
			result.output.includes('concrete semantic version string'),
		`The invalid marker failure must name its feature and contract:\n${result.output}`,
	);

	writeJson('.aidd/features/alpha/feature.json', {
		id: 'alpha',
		spernakit_version: '3.16.0',
	});
	result = runCheck();
	assert(result.exitCode === 0, `Concrete markers must pass:\n${result.output}`);
	assert(
		result.output.includes('[OK] Every template-owned feature carries spernakit_version') &&
			result.output.includes('3 feature records'),
		`The passing result must be explicit and non-vacuous:\n${result.output}`,
	);

	console.log(`[OK] Template feature version guard self-test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
