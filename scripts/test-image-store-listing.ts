#!/usr/bin/env bun
/**
 * check:image-licenses reads the image's npm packages from the names of Bun's store directories,
 * which only the docker smoke modes and CI can open. This drives the parser behind it on a fixed
 * listing, so a change in how Bun names those directories fails here rather than first in CI.
 *
 * Bun 1.4.5 started naming a peer-dependency variant `<name>@<version>+<16 hex digits>`. Reading
 * that suffix as part of the version left 67 packages unattributed in the first 3.52.x image.
 */
import { exit } from 'node:process';

import { parseStoreListing } from './lib/third-party-licenses/image-inventory.ts';

const listing = [
	'.cache',
	'node_modules',
	'',
	'zod@4.6.7\r',
	'@floating-ui+core@1.8.0',
	'@elysiajs+swagger@1.3.1+bfd246e8675f3a7c',
	'react-dom@19.2.0+ab9c01e4ccdf52df',
	'@radix-ui+react-dialog@1.3.1+ab9c01e4ccdf52df',
	'@radix-ui+react-dialog@1.3.1+0441d6f8f57aca1e',
	'semver-meta@1.0.0+build.5',
].join('\n');

const expected: [string, string[]][] = [
	['@elysiajs/swagger@1.3.1', ['@elysiajs+swagger@1.3.1+bfd246e8675f3a7c']],
	['@floating-ui/core@1.8.0', ['@floating-ui+core@1.8.0']],
	[
		'@radix-ui/react-dialog@1.3.1',
		[
			'@radix-ui+react-dialog@1.3.1+ab9c01e4ccdf52df',
			'@radix-ui+react-dialog@1.3.1+0441d6f8f57aca1e',
		],
	],
	['react-dom@19.2.0', ['react-dom@19.2.0+ab9c01e4ccdf52df']],
	['semver-meta@1.0.0+build.5', ['semver-meta@1.0.0+build.5']],
	['zod@4.6.7', ['zod@4.6.7']],
];

const actual = [...parseStoreListing(listing)];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
	console.error('[FAIL] parseStoreListing read the store listing wrongly.');
	console.error(`  expected ${JSON.stringify(expected)}`);
	console.error(`  actual   ${JSON.stringify(actual)}`);
	exit(1);
}

console.log(
	'[OK] Store listing: scoped names, peer-variant suffixes and duplicate variants normalise to ' +
		`<name>@<version>, each keeping its directories (${actual.length} packages).`,
);
