/**
 * The shared lucide icon-name mapping, pinned by the two names where the old
 * plugin-local mapping disagreed with the gate (Room #37805): digit boundaries.
 */

import { lucideIconKebab } from '../shared/src/lucideNames.ts';

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

console.log(`Lucide name mapping test passed (${checks} assertions).`);
