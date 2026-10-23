/**
 * The template's delivered hooks and their scaffold copies, read and compared as pairs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assert, equalBytes } from './harness.ts';

/**
 * Hooks whose delivered copy differs from the scaffold copy by design. smokestack v0.6.0 moved the
 * template's own hooks to scripts/smokestack/hooks/ and made pre-commit and pre-push chain the
 * repository's own hook, while scaffolding/ still ships the derived-app layout. The next template
 * release moves derived apps to the new layout and rewrites scaffolding/; empty this set then, so
 * the byte-match contract holds for every hook again.
 */
export const EXPECTED_DIVERGENCE = new Set([
	'leak-guard-setup.sh',
	'leak-guard.sh',
	'pre-commit',
	'pre-push',
]);

export interface HookPair {
	root: Buffer;
	scaffold: Buffer;
}

/**
 * Reads a hook or guard from the delivered copy and from `scaffolding/`.
 *
 * @param repoRoot - The template repository root.
 * @param name - The hook or guard file name.
 * @returns Both copies' bytes.
 */
export function readPair(repoRoot: string, name: string): HookPair {
	return {
		root: readFileSync(join(repoRoot, 'scripts', 'smokestack', 'hooks', name)),
		scaffold: readFileSync(join(repoRoot, 'scaffolding', '.githooks', name)),
	};
}

/**
 * Asserts that each pair byte-matches, except the expected divergences, which must exist on both
 * sides and must really differ, so a set left over after the next release fails here.
 *
 * @param pairs - Each pair with its file name and a readable label.
 */
export function assertPairs(pairs: readonly (readonly [string, string, HookPair])[]): void {
	for (const [file, label, pair] of pairs) {
		if (EXPECTED_DIVERGENCE.has(file)) {
			assert(
				pair.root.length > 0 && pair.scaffold.length > 0,
				`The ${label} must exist both as a delivered copy and in scaffolding/.githooks/.`,
			);
			assert(
				!equalBytes(pair.root, pair.scaffold),
				`${file} byte-matches its scaffold copy again; remove it from EXPECTED_DIVERGENCE.`,
			);
			continue;
		}
		assert(
			equalBytes(pair.root, pair.scaffold),
			`The scaffold ${label} must byte-match the delivered copy.`,
		);
	}
}
