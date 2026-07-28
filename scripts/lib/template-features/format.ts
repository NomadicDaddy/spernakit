/**
 * Serialize `.aidd` metadata in the DESTINATION repository's Prettier shape.
 *
 * This is not a style preference. Derived apps track `.aidd/` in git and gate it with
 * `check:aidd-format`, and Prettier's JSON printer makes layout decisions no hand-rolled serializer
 * reproduces: arrays print inline when they fit `printWidth` and expand when they do not, and
 * `prettier-plugin-sort-json` orders keys. `JSON.stringify(value, null, '\t')` — which is what aidd's
 * own runtime writes — expands every array unconditionally, so a sync built on it would leave every
 * file it touched failing the destination's own format gate.
 *
 * The config is resolved from the destination path rather than from this repository, because the
 * destination is what `check:aidd-format` will be run against.
 */
import { dirname } from 'node:path';

export async function formatJsonFor(destPath: string, value: unknown): Promise<string> {
	const { format, resolveConfig } = await import('prettier');

	const config = await resolveConfig(destPath);
	if (config === null) {
		throw new Error(
			`No Prettier configuration resolves from ${dirname(destPath)}. Writing there would ` +
				"produce metadata in a shape the destination's own check:aidd-format rejects.",
		);
	}

	try {
		return await format(JSON.stringify(value), {
			...config,
			filepath: destPath,
			parser: 'json',
		});
	} catch (err) {
		// Plugin resolution happens relative to the destination's config file, so the usual cause
		// is a checkout whose dependencies were never installed.
		throw new Error(
			`Prettier could not format ${destPath}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err },
		);
	}
}
