/**
 * Repository and git IO helpers for the template drift/sync tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

export function resolveSpernakitPath(
	explicit: string | undefined,
	repoRoot: string
): null | string {
	// 1. Explicit CLI arg
	if (explicit) {
		const resolved = path.resolve(explicit);
		if (fs.existsSync(path.join(resolved, '.git'))) return resolved;
		console.log(`   Warning: --template path is not a git repo: ${resolved}`);
		return null;
	}

	// 2. Environment variable
	const envPath = process.env['SPERNAKIT_PATH'];
	if (envPath) {
		const resolved = path.resolve(envPath);
		if (fs.existsSync(path.join(resolved, '.git'))) return resolved;
		console.log(`   Warning: SPERNAKIT_PATH is not a git repo: ${resolved}`);
		return null;
	}

	// 3. Convention: sibling directory
	const sibling = path.resolve(path.join(repoRoot, '..', 'spernakit'));
	if (fs.existsSync(path.join(sibling, '.git'))) return sibling;

	console.log('   Warning: spernakit repo not found at ../spernakit');
	console.log('   Use --template /path/to/spernakit or set SPERNAKIT_PATH');
	return null;
}

export function readSpernakitVersion(repoRoot: string): null | string {
	const pkgPath = path.join(repoRoot, 'package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
		const version = pkg['spernakit_version'] as string | undefined;
		if (version) return version;

		// If this is spernakit itself, there's no spernakit_version field
		const name = pkg['name'] as string | undefined;
		if (name === 'spernakit') return null;

		console.log('   Warning: No spernakit_version field in package.json');
		return null;
	} catch {
		console.log('   Warning: Could not read package.json');
		return null;
	}
}

export function isSpernakitItself(repoRoot: string): boolean {
	const pkgPath = path.join(repoRoot, 'package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
		return pkg['name'] === 'spernakit';
	} catch {
		return false;
	}
}

export function gitTagExists(spernakitPath: string, version: string): boolean {
	const result = Bun.spawnSync(['git', '-C', spernakitPath, 'rev-parse', `v${version}`], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return result.exitCode === 0;
}

export function getTemplateFileAtVersion(
	spernakitPath: string,
	version: string,
	filePath: string
): null | string {
	const result = Bun.spawnSync(['git', '-C', spernakitPath, 'show', `v${version}:${filePath}`], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	if (result.exitCode !== 0) return null;
	return result.stdout.toString();
}

export function readLocalFile(repoRoot: string, filePath: string): null | string {
	const fullPath = path.join(repoRoot, filePath);
	try {
		return fs.readFileSync(fullPath, 'utf8');
	} catch {
		return null;
	}
}
