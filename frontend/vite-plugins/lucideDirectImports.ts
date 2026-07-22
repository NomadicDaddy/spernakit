import type { Plugin } from 'vite';

/**
 * Converts PascalCase icon names to kebab-case file names for lucide-react direct imports.
 * Handles the Icon suffix that some exports have (e.g., "CheckIcon" -> "check", "CircleCheckIcon" -> "circle-check").
 * Also handles numeric suffixes like "Loader2" -> "loader-2".
 * Example: "ChevronDown" -> "chevron-down", "ArrowLeft" -> "arrow-left", "CheckIcon" -> "check", "Loader2" -> "loader-2"
 */
function toKebabCase(name: string): string {
	// Remove the "Icon" suffix if present (lucide exports both Bell and BellIcon)
	const baseName = name.endsWith('Icon') ? name.slice(0, -4) : name;

	return baseName
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.replace(/([a-zA-Z])(\d)/g, '$1-$2') // Handle numeric suffixes: "Loader2" -> "Loader-2"
		.toLowerCase();
}

/**
 * Vite plugin that transforms lucide-react barrel imports to direct icon imports.
 * This improves build performance and reduces bundle size by avoiding the large
 * lucide-react barrel file that loads all 1500+ icons.
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
					if (asMatch) {
						valueImports.push({ alias: asMatch[2], originalName: asMatch[1] });
					} else if (trimmed.length > 0) {
						valueImports.push({ alias: trimmed, originalName: trimmed });
					}
				}

				// If no value imports to transform, preserve original
				if (valueImports.length === 0) return match;

				// Generate individual direct imports for value imports
				const lines = valueImports.map(({ alias, originalName }) => {
					const kebabName = toKebabCase(originalName);
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
