import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { cwd, exit } from 'node:process';

/**
 * Enforces the 300-line-per-file modularity rule across app-owned tracked source trees.
 *
 * Background: the codebase has gone through repeated "split oversized file" refactoring waves
 * (see CHANGELOG entries for handler/service decompositions) because the 300-line guideline was
 * never enforced by automation — files regrew after every cleanup pass. This check is the CI gate
 * that prevents the oscillation from recurring: any tracked `.ts`/`.tsx` source file over
 * `MAX_LINES` fails `smoke:qc`, so oversized files must be split at land-time rather than in a
 * later audit.
 *
 * The threshold is a hard ceiling with no app-owned grandfather list: the existing oversized
 * files were refactored below it in the same change that introduced this check. The vendored
 * `scripts/spernakit-browser/` tool is excluded because derived apps consume it as external
 * tooling and are not meant to refactor its self-contained browser-evaluation modules.
 */

const MAX_LINES = 300;
const scannedRoots = ['cli/src', 'backend/src', 'frontend/src', 'shared/src', 'scripts'];
const skippedDirs = new Set(['build', 'dist', 'node_modules', 'snapshots']);
const skippedPathPrefixes = ['scripts/spernakit-browser'];

interface Finding {
	file: string;
	lines: number;
}

function isScannedFile(path: string): boolean {
	return /\.(?:ts|tsx)$/i.test(path) && !path.endsWith('.d.ts');
}

function isSkippedPath(projectRoot: string, path: string): boolean {
	const relativePath = relative(projectRoot, path).split(sep).join('/');
	return skippedPathPrefixes.some(
		(prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`),
	);
}

async function collectFiles(projectRoot: string, path: string): Promise<string[]> {
	if (isSkippedPath(projectRoot, path)) return [];
	const info = await stat(path);
	if (info.isFile()) return isScannedFile(path) ? [path] : [];
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (skippedDirs.has(entry.name)) continue;
		const child = join(path, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(projectRoot, child)));
		else if (entry.isFile() && isScannedFile(child)) files.push(child);
	}
	return files;
}

function countLines(text: string): number {
	if (text.length === 0) return 0;
	const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
	return withoutTrailingNewline.split(/\r?\n/).length;
}

export async function runCheckMaxLines(projectRoot = cwd()): Promise<number> {
	const findings: Finding[] = [];
	for (const root of scannedRoots) {
		const fullRoot = join(projectRoot, root);
		try {
			await stat(fullRoot);
		} catch {
			continue;
		}
		const files = await collectFiles(projectRoot, fullRoot);
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			const lines = countLines(text);
			if (lines > MAX_LINES) {
				const relPath = relative(projectRoot, file).split(sep).join('/');
				findings.push({ file: relPath, lines });
			}
		}
	}

	if (findings.length > 0) {
		findings.sort((a, b) => b.lines - a.lines);
		console.error(
			`max-lines check failed: ${findings.length} file(s) exceed ${MAX_LINES} lines.`,
		);
		console.error(
			'Split oversized files into cohesive modules (facade + submodules / extracted components).',
		);
		for (const finding of findings) {
			console.error(`- ${finding.file}:${finding.lines} (max ${MAX_LINES})`);
		}
		return 1;
	}

	console.log(`max-lines check passed (no file exceeds ${MAX_LINES} lines).`);
	return 0;
}

if (import.meta.main) {
	exit(await runCheckMaxLines());
}
