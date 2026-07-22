import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import { isSpernakitItself } from './lib/template/repo.ts';

const CORE_FILES = [
	'scripts/check-license-core.ts',
	'scripts/lib/license-core/expression.ts',
	'scripts/lib/license-core/installed.ts',
	'scripts/lib/license-core/lockfile.ts',
	'scripts/lib/license-core/manifest.ts',
	'scripts/lib/license-core/order.ts',
	'scripts/lib/license-core/resolve.ts',
] as const;

interface Target {
	directory: string;
	packageName: string;
}

/**
 * Sibling repositories that share the license core, read from a gitignored file rather than a
 * literal.
 *
 * The list used to be hardcoded here. That put private sibling repository names into a published
 * repo — the exact thing .githooks/leak-guard.sh exists to stop — and this file ships to derived
 * apps (see classify.ts), so every adopter inherited the roster verbatim. The roster is also
 * inherently per-checkout: it names whatever repos happen to sit beside this one.
 *
 * Absent config is not an error. CI checks out one repository, so there is nothing to sync there,
 * and an adopter has no siblings at all; both cases must leave `smoke:qc` green.
 *
 * Format (see license-core-targets.json.example): a JSON array whose entries are either a
 * directory name beside this repository, or { directory, packageName } when the package.json
 * "name" differs from the directory. Targets that are not checked out are skipped, so one list
 * works across machines.
 */
function loadTargets(root: string): Target[] {
	const configPath = join(root, 'license-core-targets.json');
	if (!existsSync(configPath)) return [];

	const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error(`${configPath}: expected an array of target entries.`);
	}

	return parsed.map((entry, index) => {
		const candidate =
			typeof entry === 'string'
				? { directory: entry, packageName: entry }
				: entry && typeof entry === 'object'
					? (entry as Record<string, unknown>)
					: null;
		const directory = candidate?.directory;
		const packageName = candidate?.packageName ?? directory;

		if (
			typeof directory !== 'string' ||
			directory.length === 0 ||
			directory !== directory.trim() ||
			directory === '.' ||
			directory === '..' ||
			/[\\/]/u.test(directory)
		) {
			throw new Error(
				`${configPath}: entry ${index} directory must be one sibling directory name.`
			);
		}
		if (
			typeof packageName !== 'string' ||
			packageName.length === 0 ||
			packageName !== packageName.trim()
		) {
			throw new Error(
				`${configPath}: entry ${index} packageName must be a non-empty string.`
			);
		}

		return { directory, packageName };
	});
}

/**
 * True when a target file has uncommitted changes in its own repository.
 *
 * Spernakit is the source of truth, so overwriting a sibling's committed divergence is this
 * script's job and git can recover it. Uncommitted work is different: Bun.write destroys it with
 * no undo and the only trace is a cheerful "Synced" line. Git inspection failures must stop the
 * sync because the script cannot prove that overwriting the file is recoverable.
 */
function hasUncommittedChanges(targetRoot: string, relativePath: string): boolean {
	const result = Bun.spawnSync(
		['git', '-C', targetRoot, 'status', '--porcelain', '--', relativePath],
		{
			stderr: 'pipe',
			stdout: 'pipe',
		}
	);
	if (result.exitCode !== 0) {
		const detail = result.stderr.toString().trim();
		throw new Error(
			`Refusing to sync ${targetRoot}: git could not inspect ${relativePath}.${detail ? ` ${detail}` : ''}`
		);
	}
	return result.stdout.toString().trim().length > 0;
}

/**
 * Confirms a sync target is the expected package. Returns 'absent' when the sibling repository is
 * not on disk — the normal case in CI, where only one repository is checked out. An absent target
 * is skipped (drift for it simply cannot be verified here); a present-but-wrong package is a real
 * misconfiguration and still throws.
 */
async function targetState(path: string, expectedName: string): Promise<'absent' | 'ok'> {
	const manifestText = await Bun.file(join(path, 'package.json'))
		.text()
		.catch(() => null);
	if (manifestText === null) return 'absent';
	const manifest = JSON.parse(manifestText) as { name?: string };
	if (manifest.name !== expectedName) {
		throw new Error(`Refusing to sync ${path}: expected package ${expectedName}.`);
	}
	return 'ok';
}

async function main(): Promise<void> {
	const root = resolve(cwd());

	// This file ships to derived apps via template sync, so cwd is not necessarily
	// Spernakit. Without this guard a run from a derived app makes that app the
	// source and overwrites every adopter from a copy — and --check would compare
	// adopters against the wrong baseline and report a meaningless verdict.
	if (!isSpernakitItself(root)) {
		console.error('Refusing to run: Spernakit is the source of truth for license core.');
		console.error(`Run this from the Spernakit repository, not ${root}.`);
		exit(1);
	}

	const applications = dirname(root);
	const check = Bun.argv.includes('--check');
	const drift: string[] = [];
	const skipped: string[] = [];
	const blocked: string[] = [];

	const targets = loadTargets(root);
	if (targets.length === 0) {
		console.log(
			'No license-core-targets.json present; no sibling repositories to synchronize. ' +
				'Copy license-core-targets.json.example to license-core-targets.json to register some.'
		);
		return;
	}

	for (const target of targets) {
		const targetRoot = resolve(applications, target.directory);
		if ((await targetState(targetRoot, target.packageName)) === 'absent') {
			console.warn(
				`Skipping ${target.directory}: sibling repository not present at ${targetRoot}.`
			);
			skipped.push(target.directory);
			continue;
		}
		for (const relativePath of CORE_FILES) {
			const source = await Bun.file(join(root, relativePath)).text();
			const destination = join(targetRoot, relativePath);
			const current = await Bun.file(destination)
				.text()
				.catch(() => '');
			if (current === source) continue;
			if (check) {
				drift.push(`${target.directory}/${relativePath}`);
				continue;
			}
			if (hasUncommittedChanges(targetRoot, relativePath)) {
				blocked.push(`${target.directory}/${relativePath}`);
				continue;
			}
			await mkdir(dirname(destination), { recursive: true });
			await Bun.write(destination, source);
			console.log(`Synced ${target.directory}/${relativePath}`);
		}
	}

	if (blocked.length > 0) {
		console.error('Refusing to overwrite uncommitted changes:');
		for (const path of blocked) console.error(`  - ${path}`);
		console.error(
			'These files differ from Spernakit and have uncommitted work that this sync would destroy.'
		);
		console.error('Commit or discard them in the target repository, then run this again.');
		exit(1);
	}

	if (drift.length > 0) {
		console.error('Synchronized license core files have drifted:');
		for (const path of drift) console.error(`  - ${path}`);
		console.error('Run `bun run licenses:sync-core` from the Spernakit repository.');
		exit(1);
	}

	if (skipped.length > 0) {
		console.warn(
			`License core drift NOT verified for: ${skipped.join(', ')} ` +
				'(run this from a checkout where the sibling repositories are present).'
		);
	}

	console.log(
		check ? 'License core copies match Spernakit.' : 'License core synchronization complete.'
	);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	exit(1);
});
