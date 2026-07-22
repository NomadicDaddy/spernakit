/**
 * File collection and hashing helpers for the smoke test cache.
 *
 * Resolves a step's dependency globs to concrete file/directory lists and
 * hashes file contents for change detection.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { type StepDependencies } from './dependencies.ts';
import { PRETTIER_CANDIDATE_GLOBS } from './globs.ts';

function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

async function collectFiles(
	projectRoot: string,
	globs: string[],
	excludes: string[]
): Promise<string[]> {
	const allFiles = new Set<string>();

	for (const pattern of globs) {
		const glob = new Bun.Glob(pattern);

		for await (const file of glob.scan({
			absolute: false,
			cwd: projectRoot,
			onlyFiles: true,
		})) {
			const normalizedFile = normalizePath(file);
			let excluded = false;
			for (const excludePattern of excludes) {
				const excludeGlob = new Bun.Glob(excludePattern);
				if (excludeGlob.match(normalizedFile)) {
					excluded = true;
					break;
				}
			}

			if (!excluded) {
				allFiles.add(normalizedFile);
			}
		}
	}

	return Array.from(allFiles).sort();
}

export async function collectDirectories(
	projectRoot: string,
	globs: string[],
	excludes: string[]
): Promise<string[]> {
	const allDirectories = new Set<string>();

	for (const pattern of globs) {
		const glob = new Bun.Glob(pattern);

		for await (const entry of glob.scan({
			absolute: false,
			cwd: projectRoot,
			onlyFiles: false,
		})) {
			const normalizedEntry = normalizePath(entry);
			let excluded = false;
			for (const excludePattern of excludes) {
				const excludeGlob = new Bun.Glob(excludePattern);
				if (excludeGlob.match(normalizedEntry)) {
					excluded = true;
					break;
				}
			}
			if (excluded) continue;

			try {
				if (statSync(join(projectRoot, normalizedEntry)).isDirectory()) {
					allDirectories.add(normalizedEntry);
				}
			} catch {
				// Missing paths simply do not contribute to the dependency hash.
			}
		}
	}

	return Array.from(allDirectories).sort();
}

/**
 * Bun.Glob will not descend into hidden directories unless `dot: true`, so a plain `**` scan
 * cannot see `.github/**` — which `prettier --check .` very much does check. Enabling `dot`
 * for the whole tree is not the fix: it also walks node_modules' dotfiles and makes the scan
 * roughly ten times slower, which the pre-commit inner loop pays on every run.
 *
 * Hidden directories are therefore walked one at a time. Any that .prettierignore already
 * covers (.aidd, .claude, .vscode) is skipped as a whole via a single probe instead of being
 * enumerated and rejected file by file.
 */
async function collectHiddenCandidates(projectRoot: string): Promise<string[]> {
	const { getFileInfo } = await import('prettier');
	const candidates: string[] = [];

	for (const entry of readdirSync(projectRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.startsWith('.')) continue;
		if (entry.name === '.git') continue;

		const probe = await getFileInfo(join(projectRoot, entry.name, 'probe.md'), {
			ignorePath: join(projectRoot, '.prettierignore'),
		});
		if (probe.ignored) continue;

		const glob = new Bun.Glob('**/*');
		for await (const file of glob.scan({
			absolute: false,
			cwd: join(projectRoot, entry.name),
			dot: true,
			onlyFiles: true,
		})) {
			candidates.push(`${entry.name}/${normalizePath(file)}`);
		}
	}

	return candidates;
}

async function collectPrettierFiles(
	projectRoot: string,
	deps: StepDependencies
): Promise<string[]> {
	const { getFileInfo } = await import('prettier');
	const candidates = [
		...(await collectFiles(projectRoot, PRETTIER_CANDIDATE_GLOBS, deps.excludes)),
		...(await collectHiddenCandidates(projectRoot)),
	];
	const prettierFiles = new Set<string>();

	for (const file of candidates) {
		const info = await getFileInfo(join(projectRoot, file), {
			ignorePath: join(projectRoot, '.prettierignore'),
			resolveConfig: true,
			withNodeModules: false,
		});

		if (!info.ignored && info.inferredParser) {
			prettierFiles.add(file);
		}
	}

	const toolFiles = await collectFiles(projectRoot, deps.globs, []);
	for (const file of toolFiles) {
		prettierFiles.add(file);
	}

	return Array.from(prettierFiles).sort();
}

export async function collectDependencyFiles(
	projectRoot: string,
	deps: StepDependencies
): Promise<string[]> {
	if (deps.collector === 'prettier') {
		return collectPrettierFiles(projectRoot, deps);
	}

	return collectFiles(projectRoot, deps.globs, deps.excludes);
}

export async function hashFile(projectRoot: string, filePath: string): Promise<string> {
	try {
		const fullPath = join(projectRoot, filePath);
		const file = Bun.file(fullPath);
		const content = await file.arrayBuffer();
		return Bun.hash(content).toString(16);
	} catch {
		return 'missing';
	}
}
