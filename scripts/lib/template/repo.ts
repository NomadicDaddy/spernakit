/**
 * Repository and git IO helpers for the template drift/sync tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

export function resolveSpernakitPath(
	explicit: string | undefined,
	repoRoot: string,
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

	// 3. Convention: sibling directory — of the main checkout when this one is a git worktree.
	// A worktree lives elsewhere (D:/applications.worktrees/<app>/<agent>/<task>), so its own
	// ../spernakit does not exist, and the resulting skip let a worktree commit report a drift pass
	// on a check that never ran (deeper d513381).
	const roots = [repoRoot];
	const main = mainCheckoutRoot(repoRoot);
	if (main && main !== repoRoot) roots.push(main);
	for (const root of roots) {
		const sibling = path.resolve(path.join(root, '..', 'spernakit'));
		if (fs.existsSync(path.join(sibling, '.git'))) return sibling;
	}

	console.log('   Warning: spernakit repo not found at ../spernakit');
	console.log('   Use --template /path/to/spernakit or set SPERNAKIT_PATH');
	return null;
}

/**
 * The main checkout behind a git worktree, or null when `repoRoot` is not a worktree.
 *
 * A worktree's `.git` is a file (`gitdir: <main>/.git/worktrees/<name>`), and that directory's
 * `commondir` names the shared `.git` relative to itself. Read from disk rather than asked of git so
 * the lookup stays synchronous and needs no git on PATH.
 */
function mainCheckoutRoot(repoRoot: string): null | string {
	try {
		const dotGit = path.join(repoRoot, '.git');
		if (!fs.statSync(dotGit).isFile()) return null;
		const pointer = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'))?.[1]?.trim();
		if (!pointer) return null;
		const gitDir = path.resolve(repoRoot, pointer);
		const common = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
		return path.dirname(path.resolve(gitDir, common));
	} catch {
		return null;
	}
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
		windowsHide: true,
	});
	return result.exitCode === 0;
}

export function getTemplateFileAtVersion(
	spernakitPath: string,
	version: string,
	filePath: string,
): null | string {
	const result = Bun.spawnSync(['git', '-C', spernakitPath, 'show', `v${version}:${filePath}`], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
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

/** Presence-only check for an app-relative path — the deletion detector never needs the contents. */
export function fileExistsInApp(repoRoot: string, filePath: string): boolean {
	return fs.existsSync(path.join(repoRoot, filePath));
}
