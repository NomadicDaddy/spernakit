#!/usr/bin/env bun
/**
 * Point git at the delivered Smokestack hooks for this checkout only. Run by `prepare`.
 *
 * A linked worktree shares its repository's config file unless `extensions.worktreeConfig` is on.
 * With it on, this writes `core.hooksPath` to the checkout's own config.worktree, so installing in
 * an upgrade worktree never changes which hooks the main checkout runs. With it off, the write goes
 * to the shared config exactly as before (`--local`). This script never turns the extension on:
 * that is a repository-wide setting, made once on purpose before an upgrade worktree is created
 * (worktree-prepare-shared-hook-path, option W).
 */
import { hooksConfigFlag } from './lib/template/git-hooks-scope.ts';

const HOOKS_DIR = 'scripts/smokestack/hooks';

const root = process.cwd();
const flag = hooksConfigFlag(root);
const result = Bun.spawnSync(['git', '-C', root, 'config', flag, 'core.hooksPath', HOOKS_DIR], {
	stderr: 'pipe',
	stdout: 'pipe',
	windowsHide: true,
});
if (result.exitCode !== 0) {
	console.error(
		`set-hooks-path: git config ${flag} core.hooksPath failed: ${result.stderr.toString().trim()}`,
	);
	process.exit(1);
}
