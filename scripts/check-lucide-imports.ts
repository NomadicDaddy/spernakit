/**
 * Fails when a named lucide-react import does not resolve to an icon the installed package
 * actually ships. The package's type layer exports names the icon file tree does not carry,
 * so typecheck, lint and the build all pass an import that only fails when the page loads -
 * a derived app shipped exactly that (found in the 2026-11-06 sweep, #37787). The check
 * walks frontend/src using the shared lucideIconKebab mapping (the same one the vite
 * import-rewrite plugin uses, from spernakit-shared) and requires every named import to
 * exist as a file under the installed icons directory.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { lucideIconKebab } from '../shared/src/lucideNames.ts';

function resolveIconsDir(root: string): null | string {
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

const root = process.cwd();
const iconsDir = resolveIconsDir(root);
if (iconsDir === null) {
	console.error(
		'[FAIL] lucide icon imports: no installed lucide-react icons directory found - install first',
	);
	process.exit(1);
}
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
					const name = raw
						.trim()
						.split(/\s+as\s+/)[0]
						?.replace(/^type\s+/, '');
					if (!name || raw.trim().startsWith('type ')) continue;
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

if (unresolved.length > 0) {
	console.error(
		`[FAIL] lucide icon imports: ${unresolved.length} of ${checked} named imports resolve to no shipped icon`,
	);
	for (const line of unresolved) console.error(`  ${line}`);
	process.exit(1);
}
console.log(`[OK] Lucide icon imports: ${checked} named import(s) all resolve to shipped icons`);
