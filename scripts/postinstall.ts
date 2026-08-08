/**
 * Refresh the third-party license documents after an install changes the dependency graph.
 *
 * `THIRD_PARTY_LICENSES.md` and `THIRD_PARTY_NOTICES.md` are generated from the lockfile, so a
 * dependency bump makes both stale the moment `bun.lock` is written. `check:licenses` catches that
 * during `smoke:qc`, but only after the fact; regenerating here means the bump and its paperwork
 * land in the same change.
 *
 * Deliberately skipped under CI. The gate that guards these documents is the same generator in
 * `--check` mode, and CI installs before it runs qc, so regenerating there would rewrite the
 * artifact immediately before the gate compared it against the artifact. A stale committed document
 * would then pass every CI run and fail only on a developer machine, which is the vacuous pass this
 * repository's gate conventions exist to prevent. Locally the write is the point; in CI the
 * comparison is.
 *
 * Also skipped where the generator is not on disk. The Docker build installs against a partial
 * tree: `Dockerfile` copies the workspace manifests, `require-bun.ts` and this file, and nothing
 * else, because pulling `scripts/lib/third-party-licenses/` into that layer would rebuild the
 * dependency cache on every edit to the license library to produce two documents the image throws
 * away. The generator is therefore imported dynamically, below the check, so a tree without it
 * never fails to resolve the module.
 *
 * Never fails the install. A refresh is a convenience, and a generator that cannot read the
 * lockfile should not stop `bun install` from completing.
 *
 * Run: bun scripts/postinstall.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const GENERATOR = 'generate-third-party-licenses.ts';

export async function runPostinstall(): Promise<number> {
	if (process.env.CI) {
		console.log(
			'[SKIP] postinstall: CI is set, so check:licenses compares rather than rewrites.',
		);
		return 0;
	}

	if (!existsSync(join(import.meta.dir, GENERATOR))) {
		console.log(`[SKIP] postinstall: ${GENERATOR} is absent, so this is a partial tree.`);
		return 0;
	}

	try {
		const { runThirdPartyLicenses } = await import(`./${GENERATOR}`);
		await runThirdPartyLicenses({});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[WARN] postinstall: license documents not refreshed (${message}).`);
		console.warn('Run `bun run licenses:generate` once the dependency graph resolves.');
	}

	return 0;
}

if (import.meta.main) {
	process.exit(await runPostinstall());
}
