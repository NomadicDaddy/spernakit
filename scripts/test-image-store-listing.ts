#!/usr/bin/env bun
/**
 * check:image-licenses reads the image's npm packages from Bun's store, which only the docker smoke
 * modes and CI can open. This drives the pure parts behind it on fixed input, so a change in how
 * Bun names store directories fails here rather than first in CI.
 *
 * Bun 1.4.5 started naming a peer-dependency variant `<name>@<version>+<16 hex digits>`. Reading
 * that suffix as part of the version left 67 packages unattributed in the first 3.52.x image, and
 * stripping it by pattern would merge a release whose real build tag is 16 hex digits. So identity
 * comes from each package's own manifest, and license files are looked for in the package's own
 * directory in every variant, not in the node_modules its dependencies are linked into.
 */
import { exit } from 'node:process';

import {
	type LicenseProbe,
	licenseProbes,
	licenseProbeScript,
	parseProbeOutput,
	shellQuote,
} from './lib/third-party-licenses/image-notices.ts';
import {
	groupStoreManifests,
	storeDirPackageName,
} from './lib/third-party-licenses/image-store.ts';

const failures: string[] = [];
function expect(label: string, actual: unknown, expected: unknown): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		failures.push(
			`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
}
function expectThrows(label: string, run: () => unknown): void {
	try {
		run();
		failures.push(`${label}: expected an error, got none`);
	} catch {
		// The refusal is the expected outcome.
	}
}
const record = (dir: string, name: string, version: string, license = 'MIT'): string =>
	`${dir}\t${JSON.stringify({ license, name, version })}`;

// Store directory names give the package name and nothing else.
expect('scoped', storeDirPackageName('@floating-ui+core@1.8.0'), '@floating-ui/core');
expect(
	'scoped variant',
	storeDirPackageName('@elysiajs+swagger@1.3.1+bfd246e8675f3a7c'),
	'@elysiajs/swagger',
);
expect('unscoped variant', storeDirPackageName('react-dom@19.2.0+ab9c01e4ccdf52df'), 'react-dom');
expect('dot entry', storeDirPackageName('.cache'), undefined);
expect('not a package', storeDirPackageName('node_modules'), undefined);

const packages = groupStoreManifests(
	[
		record('zod@4.6.7', 'zod', '4.6.7'),
		record('@elysiajs+swagger@1.3.1+bfd246e8675f3a7c', '@elysiajs/swagger', '1.3.1'),
		record('@radix-ui+react-dialog@1.3.1+ab9c01e4ccdf52df', '@radix-ui/react-dialog', '1.3.1'),
		record('@radix-ui+react-dialog@1.3.1+0441d6f8f57aca1e', '@radix-ui/react-dialog', '1.3.1'),
		// A real build tag of 16 hex digits looks exactly like a peer-variant suffix. The manifest
		// says it is a different release, and it must stay one.
		record('hexbuild@1.0.0', 'hexbuild', '1.0.0'),
		record('hexbuild@1.0.0+0123456789abcdef', 'hexbuild', '1.0.0+0123456789abcdef', 'ISC'),
		'',
	].join('\n'),
);
expect(
	'identities from manifests',
	[...packages].map(([id, pkg]) => [id, pkg.dirs, pkg.license]),
	[
		['@elysiajs/swagger@1.3.1', ['@elysiajs+swagger@1.3.1+bfd246e8675f3a7c'], 'MIT'],
		[
			'@radix-ui/react-dialog@1.3.1',
			[
				'@radix-ui+react-dialog@1.3.1+ab9c01e4ccdf52df',
				'@radix-ui+react-dialog@1.3.1+0441d6f8f57aca1e',
			],
			'MIT',
		],
		['hexbuild@1.0.0', ['hexbuild@1.0.0'], 'MIT'],
		['hexbuild@1.0.0+0123456789abcdef', ['hexbuild@1.0.0+0123456789abcdef'], 'ISC'],
		['zod@4.6.7', ['zod@4.6.7'], 'MIT'],
	],
);
expectThrows('manifest names another package', () =>
	groupStoreManifests(record('zod@4.6.7', 'not-zod', '4.6.7')),
);
expectThrows('variants of one release disagree on the license', () =>
	groupStoreManifests(
		[
			record('a@1.0.0+ab9c01e4ccdf52df', 'a', '1.0.0', 'MIT'),
			record('a@1.0.0+0441d6f8f57aca1e', 'a', '1.0.0', 'GPL-3.0'),
		].join('\n'),
	),
);

expectThrows('a record line with no tab', () => groupStoreManifests('zod@4.6.7 {"name":"zod"}'));
expectThrows('a directory with no readable package.json', () => groupStoreManifests('zod@4.6.7\t'));

// The license probe opens every variant's own package directory, never the node_modules above it.
const probe = licenseProbeScript(licenseProbes(['@radix-ui/react-dialog@1.3.1'], packages));
for (const dir of [
	'@radix-ui+react-dialog@1.3.1+ab9c01e4ccdf52df',
	'@radix-ui+react-dialog@1.3.1+0441d6f8f57aca1e',
]) {
	const own = `find '/app/node_modules/.bun/${dir}/node_modules/@radix-ui/react-dialog' -maxdepth 2 `;
	if (!probe.includes(own)) failures.push(`license probe skips ${dir}'s own package directory`);
}
if (/\/node_modules'? -maxdepth/.test(probe)) {
	failures.push('license probe searches a whole node_modules, where sibling packages live');
}

// Metadata read from the image is data. A hostile path reaches the shell only inside one quoted
// word, so with that word removed none of it is left, and only an index comes back out.
const hostile: LicenseProbe = {
	dir: "x'$(touch pwned)';y@1.0.0",
	entry: "x'$(touch pwned)';y@1.0.0",
	path: "/app/node_modules/.bun/x'$(touch pwned)';y@1.0.0/node_modules/x`id`",
};
const hostileScript = licenseProbeScript([hostile]);
expect('a single quote closes, escapes and reopens', shellQuote("a'b"), `'a'\\''b'`);
if (!hostileScript.includes(shellQuote(hostile.path))) {
	failures.push('license probe does not quote the path as one word');
}
if (/touch|`id`|;y@/.test(hostileScript.replace(shellQuote(hostile.path), ''))) {
	failures.push('license probe lets image metadata into shell source');
}
expect(
	'probe output names entries by index',
	parseProbeOutput('MISSING 0\nMISSING 0\n', [hostile]),
	[hostile.entry],
);
for (const output of ['MISSING 1', 'MISSING 0; rm -rf /', 'MISSING x', 'something else']) {
	expectThrows(`probe output ${JSON.stringify(output)}`, () =>
		parseProbeOutput(output, [hostile]),
	);
}

if (failures.length > 0) {
	console.error('[FAIL] image store reading:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	`[OK] Image store: names, manifest identities (${packages.size} releases, peer variants ` +
		'merged, a 16-hex build tag kept apart), refusals and per-variant license probes.',
);
