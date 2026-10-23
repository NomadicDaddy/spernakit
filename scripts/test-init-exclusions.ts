#!/usr/bin/env bun
/**
 * Init-from-HEAD exclusion control. The fresh-release tests validate init against the last tag,
 * so a path that moves on HEAD between releases is invisible to every gate until the next tag -
 * exactly how the smokestack v0.6.0 move left the old-path exclusions matching nothing while the
 * template-only set became copyable into every new app (shadow review 2026-10-23, Medium). This
 * control initializes a throwaway app from the live HEAD checkout (copy only: --no-install) and
 * asserts three things: the template-only set never lands, the app-facing smokestack files do
 * land, and the copied tree is self-consistent - every relative import in scripts/**.ts resolves
 * inside the probe, and every package.json script target exists - so the app a new repository
 * receives typechecks and runs its own gates rather than merely lacking the excluded files
 * (reviews #20481/#20486/#20487).
 */
import { strict as assert } from 'node:assert';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { isInitExcluded } from './lib/template/exclusions.ts';

const repoRoot = resolve(import.meta.dir, '..');

/** Template-only files that must never appear in an initialized app, at their v0.6.0 homes. */
const forbidden = [
	'scripts/smokestack/smokestack.ts',
	'scripts/smokestack/lib/smokestack',
	'scripts/smokestack/lib/shared-core',
	'scripts/smokestack/shared-core-manifest.json',
	'scripts/smokestack/sync-shared-core.ts',
	'scripts/smokestack/smokestack.json',
	'scripts/smokestack/smokestack.lock',
	'scripts/smokestack.ts',
	'scripts/lib/smokestack',
	'scripts/lib/shared-core',
	'scripts/shared-core-manifest.json',
	'scripts/sync-shared-core.ts',
	'smokestack.json',
	'smokestack.lock',
];

/** App-facing smokestack files the template owes every initialized app. */
const required = [
	'scripts/smokestack/check-leak-guard.sh',
	'scripts/smokestack/run-bash.ts',
	'scripts/smokestack/hooks/pre-commit',
	'scripts/smokestack/hooks/leak-guard-setup.sh',
	'scripts/smokestack/lib/license-core',
	'scripts/smokestack/check-script-targets.ts',
	'scripts/smokestack/check-destructive-confirmation.ts',
];

function run(args: string[], cwd: string): { exitCode: number; output: string } {
	const proc = Bun.spawnSync(['bun', ...args], { cwd, stderr: 'pipe', stdout: 'pipe' });
	return {
		exitCode: proc.exitCode,
		output: proc.stdout.toString() + proc.stderr.toString(),
	};
}

function tsFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true })
		.map((entry) => entry.toString())
		.filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
		.map((entry) => join(dir, entry));
}

const workDir = mkdtempSync(join(tmpdir(), 'spernakit-init-exclusions-'));
try {
	const target = join(workDir, 'probe-app');
	// Point the manifest write at a copy so the fleet registry in this checkout is untouched.
	const manifestCopy = join(workDir, 'spernakit.psd1');
	copyFileSync(join(repoRoot, 'spernakit.psd1'), manifestCopy);

	const init = Bun.spawnSync(
		[
			'bun',
			'scripts/init.ts',
			'--application',
			'init-exclusions-probe',
			'--target',
			target,
			'--name',
			'Init Exclusions Probe',
			'--description',
			'throwaway init-from-HEAD exclusion probe',
			'--no-install',
			'--manifest',
			manifestCopy,
		],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	const initOutput = init.stdout.toString() + init.stderr.toString();
	assert(
		init.exitCode === 0,
		`init from HEAD failed (exit ${String(init.exitCode)}):\n${initOutput}`,
	);

	const landed = forbidden.filter((path) => existsSync(join(target, path)));
	assert(
		landed.length === 0,
		`init from HEAD seeded template-only paths into a new app: ${landed.join(
			', ',
		)}. The exclusion list in scripts/lib/template/exclusions.ts is stale against HEAD.`,
	);

	const missing = required.filter((path) => !existsSync(join(target, path)));
	assert(
		missing.length === 0,
		`init from HEAD withheld app-facing smokestack files: ${missing.join(
			', ',
		)}. The exclusions name more than the template-only set.`,
	);

	// Self-consistency of the copy, scoped to the failure class this control exists for: the
	// consumer files the template copies (license/destructive/setup tooling) must not import a
	// smokestack module the exclusions withheld. A whole-tree import sweep would false-positive on
	// doc examples and story fixtures, so the sweep covers the consumer families named in the
	// review, with .js specifiers resolving to their compiled neighbours.
	const importPattern = /from\s+'(\.[^']+)'/g;
	const consumerPattern =
		/[\\/]scripts[\\/](lib[\\/](third-party-licenses|setup)[\\/]|test-destructive-)/;
	const unresolved: string[] = [];
	for (const file of tsFiles(join(target, 'scripts'))) {
		const normalized = file.replaceAll('\\', '/');
		if (!consumerPattern.test(normalized)) continue;
		const text = readFileSync(file, 'utf8');
		for (const match of text.matchAll(importPattern)) {
			const specifier = match[1];
			if (specifier === undefined) continue;
			const resolved = resolve(dirname(file), specifier);
			const candidates = [
				resolved,
				`${resolved}.ts`,
				`${resolved}.tsx`,
				`${resolved}.js`,
				join(resolved, 'index.ts'),
			];
			if (candidates.some((candidate) => existsSync(candidate))) continue;
			unresolved.push(`${file} imports ${specifier}`);
		}
	}
	assert(
		unresolved.length === 0,
		`copied consumer scripts import files the exclusions withheld (first 10): ${unresolved
			.slice(0, 10)
			.join('; ')}`,
	);

	// The probe's own script-targets check runs on its raw copy (pre-setup, so templateOnly script
	// entries still name excluded files). Every unresolved target must therefore be an
	// init-excluded path: a path that is neither present nor excluded is a script the template
	// ships to apps broken - the failure class the reviews named.
	const targets = run(['scripts/smokestack/check-script-targets.ts'], target);
	const unresolvedTargets = [...targets.output.matchAll(/names ([^,]+), which does not exist/g)]
		.map((match) => match[1]?.replaceAll('\\', '/'))
		.filter((path): path is string => path !== undefined);
	const wrongfullyWithheld = unresolvedTargets.filter(
		(path) => !existsSync(join(target, path)) && !isInitExcluded(path),
	);
	assert(
		targets.exitCode === 0 || wrongfullyWithheld.length === 0,
		`check-script-targets in the initialized app names paths that are neither present nor template-only: ${wrongfullyWithheld.join(
			', ',
		)}\n${targets.output}`,
	);

	console.log(
		'OK init-from-HEAD: template-only set withheld, app-facing files present, imports resolve, script targets check',
	);
} finally {
	rmSync(workDir, { force: true, recursive: true });
}
