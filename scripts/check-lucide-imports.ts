/**
 * Fails when a named lucide-react import does not resolve to an icon the installed package
 * actually ships. The package's type layer exports names the icon file tree does not carry,
 * so typecheck, lint and the build all pass an import that only fails when the page loads -
 * a derived app shipped exactly that (found in the 2026-11-06 sweep, #37787). The check
 * walks frontend/src using the shared lucideIconKebab mapping (the same one the vite
 * import-rewrite plugin uses, from spernakit-shared) and requires every named import to
 * exist as a file under the installed icons directory.
 *
 * Enforces: every named lucide-react import in frontend/src resolves to an icon file the installed
 * package ships. No assertion ID: the catalog states none for icon imports.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';

import { lucideIconKebab } from '../shared/src/lucideNames.ts';

export interface LucideImportCheckResult {
	checked: number;
	iconsDir: null | string;
	unresolved: string[];
}

export function resolveIconsDir(root: string): null | string {
	// The pinned install the frontend actually builds against (frontend/node_modules link)
	// wins; the bun store scan is only a fallback for layouts without the link.
	const linked = join(root, 'frontend', 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
	if (statSync(linked, { throwIfNoEntry: false })?.isDirectory()) return linked;
	const bunDir = join(root, 'node_modules', '.bun');
	if (statSync(bunDir, { throwIfNoEntry: false })?.isDirectory()) {
		for (const entry of readdirSync(bunDir)) {
			if (!entry.startsWith('lucide-react@')) continue;
			const candidate = join(
				bunDir,
				entry,
				'node_modules',
				'lucide-react',
				'dist',
				'esm',
				'icons',
			);
			if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
		}
	}
	return null;
}

export function checkLucideImports(root: string): LucideImportCheckResult {
	const iconsDir = resolveIconsDir(root);
	if (iconsDir === null) return { checked: 0, iconsDir: null, unresolved: [] };
	const shipped = new Set(
		readdirSync(iconsDir)
			.filter((file) => file.endsWith('.mjs'))
			.map((file) => file.slice(0, -4)),
	);

	const unresolved: string[] = [];
	let checked = 0;

	function walk(dir: string): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (!/\.tsx?$/.test(entry.name)) continue;
			else {
				const source = readFileSync(path, 'utf8');
				for (const match of source.matchAll(
					/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g,
				)) {
					const named = match[1] ?? '';
					for (const raw of named.split(',')) {
						const trimmed = raw.trim();
						const name = trimmed.split(/\s+as\s+/)[0]?.replace(/^type\s+/, '');
						if (!name || trimmed.startsWith('type ')) continue;
						checked++;
						if (!shipped.has(lucideIconKebab(name))) {
							unresolved.push(
								`${relative(root, path)}: ${name} -> ${lucideIconKebab(name)}`,
							);
						}
					}
				}
			}
		}
	}

	walk(join(root, 'frontend', 'src'));
	return { checked, iconsDir, unresolved };
}

/**
 * Runs the check from `root` and reports it.
 *
 * @returns 0 when every named import resolves, 1 when one does not or nothing is installed.
 */
export function runLucideImports(root: string = process.cwd()): number {
	const result = checkLucideImports(root);
	if (result.iconsDir === null) {
		console.error(
			'[FAIL] lucide icon imports: no installed lucide-react icons directory found - install first',
		);
		return 1;
	}
	if (result.unresolved.length > 0) {
		console.error(
			`[FAIL] lucide icon imports: ${result.unresolved.length} of ${result.checked} named imports resolve to no shipped icon`,
		);
		for (const line of result.unresolved) console.error(`  ${line}`);
		return 1;
	}
	console.log(
		`[OK] Lucide icon imports: ${result.checked} named import(s) all resolve to shipped icons`,
	);
	return 0;
}

if (import.meta.main) exit(runLucideImports());
