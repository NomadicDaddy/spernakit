import { join } from 'node:path';
import { exit } from 'node:process';

const REQUIRED_RUNTIME_LICENSE_FILES = [
	'licenses/BUN-LICENSE.md',
	'licenses/GPL-2.0.txt',
	'licenses/GPL-3.0.txt',
	'licenses/LGPL-2.0.txt',
	'licenses/LGPL-2.1.txt',
	'licenses/LGPL-3.0.txt',
	'licenses/CONTAINER-DISTRIBUTION.md',
	'licenses/base-image-packages.md',
];

export async function assertRuntimeLicenseFiles(root: string): Promise<void> {
	const missing: string[] = [];
	for (const path of REQUIRED_RUNTIME_LICENSE_FILES) {
		if (!(await Bun.file(join(root, path)).exists())) missing.push(path);
	}

	if (missing.length > 0) {
		console.error('Required runtime license material is missing:');
		for (const path of missing) console.error(`  - ${path}`);
		exit(1);
	}

	const guidance = await Bun.file(join(root, 'licenses/CONTAINER-DISTRIBUTION.md')).text();
	const requiredGuidanceTerms = [
		'not a corresponding-source offer',
		'derived project',
		'complete corresponding source',
		'rebuild or relink Bun',
	];
	const missingTerms = requiredGuidanceTerms.filter((term) => !guidance.includes(term));
	if (missingTerms.length > 0) {
		console.error('licenses/CONTAINER-DISTRIBUTION.md is missing required guidance:');
		for (const term of missingTerms) console.error(`  - ${term}`);
		exit(1);
	}
}
