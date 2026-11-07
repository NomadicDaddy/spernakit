/**
 * The shared lucide icon-name mapping, pinned by the two names where the old
 * plugin-local mapping disagreed with the gate (Room #37805): digit boundaries.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lucideDirectImportsPlugin } from '../frontend/vite-plugins/lucideDirectImports.ts';
import { lucideIconKebab } from '../shared/src/lucideNames.ts';
import { checkLucideImports } from './check-lucide-imports.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const cases: [string, string][] = [
	['ChevronDown', 'chevron-down'],
	['ArrowLeft', 'arrow-left'],
	['CheckIcon', 'check'],
	['CircleCheckIcon', 'circle-check'],
	['Loader2', 'loader-2'],
	// The two names that split the old mappings apart: digit-before-capital must split too.
	['Columns3Cog', 'columns-3-cog'],
	['Grid2X2', 'grid-2-x-2'],
];

for (const [name, expected] of cases) {
	assert(
		lucideIconKebab(name) === expected,
		`lucideIconKebab(${name}) gave ${lucideIconKebab(name)}, expected ${expected}`,
	);
}

// Pin the PLUGIN to the shared mapping: run its real transform on a sample import and
// require the rewritten path to use the same kebab result (Room #37836 L-3 - a local
// mapping in the plugin is exactly how the original disagreement happened).
const plugin = lucideDirectImportsPlugin();
const hook = plugin.transform;
if (typeof hook !== 'function' && typeof hook !== 'object') {
	throw new Error('plugin exposes no transform hook');
}
const handler = (typeof hook === 'function' ? hook : hook.handler) as
	((code: string, id: string) => Promise<{ code: string } | null | string>) | undefined;
if (handler === undefined) throw new Error('plugin transform has no handler');
const sample = `import { Columns3Cog, Grid2X2 } from 'lucide-react';\n`;
const result = await handler(sample, 'frontend/src/sample.tsx');
if (result === null) throw new Error('transform returned null for a lucide import');
const code = typeof result === 'string' ? result : result.code;
assert(
	code.includes('lucide-react/dist/esm/icons/columns-3-cog'),
	`transform must rewrite Columns3Cog to columns-3-cog, got: ${code}`,
);
assert(
	code.includes('lucide-react/dist/esm/icons/grid-2-x-2'),
	`transform must rewrite Grid2X2 to grid-2-x-2, got: ${code}`,
);

// Two-version negative control (Room #37854): with two lucide-react versions present, the
// gate must read the FRONTEND-LINKED one - an icon only the linked version ships passes,
// and an icon only the OTHER store version ships fails.
const scratch = join(tmpdir(), `lucide-two-version-${process.pid}`);
const linkedIcons = join(
	scratch,
	'frontend',
	'node_modules',
	'lucide-react',
	'dist',
	'esm',
	'icons',
);
const storeIcons = join(
	scratch,
	'node_modules',
	'.bun',
	'lucide-react@0.0.0-test',
	'node_modules',
	'lucide-react',
	'dist',
	'esm',
	'icons',
);
mkdirSync(linkedIcons, { recursive: true });
mkdirSync(storeIcons, { recursive: true });
writeFileSync(join(linkedIcons, 'linked-only.mjs'), 'export {};\n');
writeFileSync(join(storeIcons, 'store-only.mjs'), 'export {};\n');
mkdirSync(join(scratch, 'frontend', 'src'), { recursive: true });
writeFileSync(
	join(scratch, 'frontend', 'src', 'sample.tsx'),
	"import { LinkedOnly, StoreOnly } from 'lucide-react';\nexport const x = [LinkedOnly, StoreOnly];\n",
);
try {
	const result = checkLucideImports(scratch);
	assert(
		result.iconsDir === linkedIcons,
		`gate must read the frontend-linked icons directory, got ${result.iconsDir}`,
	);
	assert(
		result.unresolved.some((line) => line.includes('StoreOnly')),
		'an icon shipped only by the other store version must fail',
	);
	assert(
		!result.unresolved.some((line) => line.includes('LinkedOnly')),
		'an icon shipped by the linked version must pass',
	);
} finally {
	rmSync(scratch, { force: true, recursive: true });
}

console.log(`Lucide name mapping test passed (${checks} assertions).`);
