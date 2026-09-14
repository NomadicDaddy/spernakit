#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { collectVendoredMaterials } from './lib/third-party-licenses/vendored.ts';

await collectVendoredMaterials(resolve('.'));
const temp = mkdtempSync(join(tmpdir(), 'spernakit-vendored-license-'));
mkdirSync(join(temp, 'frontend', 'src', 'components', 'ui'), { recursive: true });
mkdirSync(join(temp, 'licenses'), { recursive: true });
writeFileSync(join(temp, 'frontend', 'src', 'components', 'ui', 'button.tsx'), 'export {};');
writeFileSync(join(temp, 'licenses', 'MIT.txt'), 'MIT fixture');
const revision = 'a'.repeat(40);
const record = {
	materials: [
		{
			copyright: 'fixture',
			includedPaths: ['frontend/src/components/ui/button.tsx'],
			licenseFile: 'licenses/MIT.txt',
			localModificationPolicy: 'fixture policy',
			name: 'shadcn/ui',
			sourceUrl: `https://example.test/repository/tree/${revision}/ui`,
			spdx: 'MIT',
			upstreamRevision: revision,
		},
	],
};
writeFileSync(join(temp, 'licenses', 'vendored-materials.json'), JSON.stringify(record));
await collectVendoredMaterials(temp);

writeFileSync(join(temp, 'frontend', 'src', 'components', 'ui', 'new.tsx'), 'export {};');
let rejected = false;
try {
	await collectVendoredMaterials(temp);
} catch {
	rejected = true;
}
if (!rejected) throw new Error('Unrecorded generated UI file did not fail closed');
try {
	rmSync(temp, { force: true, recursive: true });
} catch {
	// Best-effort cleanup of a content-free synthetic tree.
}
console.log('[OK] vendored UI provenance is immutable and rejects unrecorded generated files');
