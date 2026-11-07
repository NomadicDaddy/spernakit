import type { Plugin } from 'vite';

import { lucideIconKebab } from 'spernakit-shared';

/**
 * Vite plugin that transforms lucide-react barrel imports to direct icon imports.
 * This improves build performance and reduces bundle size by avoiding the large
 * lucide-react barrel file that loads all 1500+ icons.
 *
 * The PascalCase -> kebab-case mapping is shared with the check:lucide-imports gate
 * (spernakit-shared lucideIconKebab) so the rewrite and the gate can never disagree;
 * it splits after a digit before a capital too, which matters for names like
 * Columns3Cog and Grid2X2 (Room #37805).
 *
 * Transforms:
 *   import { Bell, LogOut } from 'lucide-react';
 * To:
 *   import { default as Bell } from 'lucide-react/dist/esm/icons/bell';
 *   import { default as LogOut } from 'lucide-react/dist/esm/icons/log-out';
 *
 * Also handles Icon suffix variants:
 *   import { BellIcon } from 'lucide-react';
 * To:
 *   import { default as BellIcon } from 'lucide-react/dist/esm/icons/bell';
 */
const lucideDirectImportsPlugin = (): Plugin => {
	return {
		enforce: 'pre',
		name: 'lucide-direct-imports',
		transform(code: string, id: string) {
			// Skip node_modules (except our own transforms) and non-TS/TSX files
			if (id.includes('node_modules')) return null;
			if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
			if (!code.includes("from 'lucide-react'")) return null;

			// Match: import { Icon1, Icon2, ... } from 'lucide-react';
			// Also handles multiline imports with newlines and type-only imports
			const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*['"]lucide-react['"]\s*;?/g;

			const transformed = code.replace(importRegex, (match, imports: string) => {
				const typeImports: string[] = [];
				const valueImports: { alias: string; originalName: string }[] = [];

				for (const raw of imports.split(',')) {
					const trimmed = raw.trim();
					if (!trimmed) continue;
					// Collect type-only imports separately (e.g., "type LucideIcon")
					if (trimmed.startsWith('type ')) {
						typeImports.push(trimmed);
						continue;
					}
					// Handle aliased imports: "Server as ServerIcon"
					const asMatch = trimmed.match(/^(\w+(?:\d+)?)\s+as\s+(\w+(?:\d+)?)$/);
					const originalName = asMatch?.[1];
					const alias = asMatch?.[2];
					if (originalName !== undefined && alias !== undefined) {
						valueImports.push({ alias, originalName });
					} else if (trimmed.length > 0) {
						valueImports.push({ alias: trimmed, originalName: trimmed });
					}
				}

				// If no value imports to transform, preserve original
				if (valueImports.length === 0) return match;

				// Generate individual direct imports for value imports
				const lines = valueImports.map(({ alias, originalName }) => {
					const kebabName = lucideIconKebab(originalName);
					return `import { default as ${alias} } from 'lucide-react/dist/esm/icons/${kebabName}';`;
				});

				// Preserve type-only imports as a separate statement
				if (typeImports.length > 0) {
					lines.push(`import { ${typeImports.join(', ')} } from 'lucide-react';`);
				}

				return lines.join('\n');
			});

			if (transformed !== code) {
				return {
					code: transformed,
					map: null, // Sourcemap not needed for simple import transforms
				};
			}

			return null;
		},
	};
};

export { lucideDirectImportsPlugin };
