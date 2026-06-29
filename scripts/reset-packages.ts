#!/usr/bin/env bun
/**
 * Reset packages script - removes node_modules, dist, and legacy lock files,
 * then reinstalls with --frozen-lockfile.
 *
 * bun.lock is intentionally preserved: deleting it and reinstalling unfrozen
 * would silently float dependency versions past the LTS lockfile freeze.
 *
 * Usage:
 *   bun scripts/reset-packages.ts
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface CleanupTarget {
	name: string;
	type: 'directory' | 'file';
}

const targets: CleanupTarget[] = [
	{ name: 'node_modules', type: 'directory' },
	{ name: 'dist', type: 'directory' },
	{ name: 'package.lock', type: 'file' },
	{ name: 'bun.lockb', type: 'file' },
];

function findItems(dir: string, targetName: string, targetType: 'directory' | 'file'): string[] {
	const results: string[] = [];

	function walk(currentDir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(currentDir);
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			let stat;
			try {
				stat = statSync(fullPath);
			} catch {
				continue;
			}

			if (entry === targetName) {
				if (targetType === 'directory' && stat.isDirectory()) {
					results.push(fullPath);
					continue; // Don't recurse into matched directories
				} else if (targetType === 'file' && stat.isFile()) {
					results.push(fullPath);
				}
			}

			// Recurse into subdirectories (but skip node_modules to avoid deep recursion)
			if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git') {
				walk(fullPath);
			}
		}
	}

	walk(dir);
	return results;
}

function removeItems(items: string[]): boolean {
	let allRemoved = true;

	for (const item of items) {
		console.log(`Removing: ${item}`);
		try {
			rmSync(item, { force: true, recursive: true });
		} catch (err) {
			console.error(`Failed to remove ${item}: ${(err as Error).message}`);
			allRemoved = false;
		}
	}

	return allRemoved;
}

async function main(): Promise<void> {
	console.log('🧹 Resetting packages...\n');

	for (const target of targets) {
		console.log(`\n📦 Finding ${target.name} (${target.type})...`);
		const items = findItems(projectRoot, target.name, target.type);

		if (items.length === 0) {
			console.log(`  No ${target.name} found.`);
			continue;
		}

		console.log(`  Found ${items.length} ${target.name} item(s).`);
		const success = removeItems(items);

		if (!success) {
			console.error(`❌ Failed to remove some ${target.name} items.`);
			process.exit(1);
		}

		// Verify removal
		const remaining = findItems(projectRoot, target.name, target.type);
		if (remaining.length > 0) {
			console.error(`❌ Failed to remove all ${target.name}:`);
			for (const item of remaining) {
				console.error(`  - ${item}`);
			}
			process.exit(1);
		}

		console.log(`  ✅ All ${target.name} removed.`);
	}

	console.log('\n📦 Running bun install --frozen-lockfile...\n');

	const proc = Bun.spawn(['bun', 'install', '--frozen-lockfile'], {
		cwd: projectRoot,
		stdio: ['inherit', 'inherit', 'inherit'],
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		console.error(`❌ bun install failed with exit code ${exitCode}`);
		process.exit(exitCode);
	}

	console.log('\n✅ Package reset complete!');
}

main().catch((err: unknown) => {
	console.error('Fatal error:', (err as Error).message);
	process.exit(1);
});
