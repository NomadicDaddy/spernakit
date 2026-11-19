/**
 * Which `core.hooksPath` git dispatches from in one checkout, and where a write to it lands, for
 * the template's own tooling: `prepare` (scripts/set-hooks-path.ts) and the template hooks-path
 * check (hooks-path.ts).
 *
 * A linked worktree shares its repository's config file unless `extensions.worktreeConfig` is on.
 * With it on, each checkout keeps its own value in config.worktree, and git dispatches from that
 * first, then the shared one. With it off, both answers are `--local`, exactly as before.
 *
 * Smokestack ships the same rules in scripts/smokestack/lib/shared-core/hooks-scope.ts, but that
 * file arrives by Smokestack's own delivery, which a derived app can take after a template
 * upgrade. If `prepare` imported it, an app between the two would get a `prepare` that fails
 * silently and sets no hooks. So the template keeps this small copy of its own.
 *
 * This is an approved compatibility bridge (Phillip, Yes #59446 on #59432). Retire it in the first
 * template release after every derived app carries Smokestack 0.10.12: import hooks-scope.ts from
 * scripts/smokestack/lib/shared-core in set-hooks-path.ts and hooks-path.ts, and delete this file.
 * Tracked as `.aidd/features/retire-template-git-hooks-scope-bridge`.
 */

function gitConfig(root: string, args: string[]): string {
	const result = Bun.spawnSync(['git', '-C', root, 'config', ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	return result.stdout.toString().trim();
}

/**
 * The scope that keeps `core.hooksPath` to `root` alone where git allows it.
 *
 * @param root - The checkout
 * @returns `--worktree` when per-worktree config is on, else `--local`
 */
export function hooksConfigFlag(root: string): '--local' | '--worktree' {
	return gitConfig(root, ['--bool', '--get', 'extensions.worktreeConfig']) === 'true'
		? '--worktree'
		: '--local';
}

/**
 * The hooks path git uses for `root` from repository config: the checkout's own value under
 * worktree config, else the shared one. Global config is left out. An empty string means unset.
 *
 * @param root - The checkout
 * @returns The configured hooks path, or an empty string
 */
export function effectiveHooksPath(root: string): string {
	const flag = hooksConfigFlag(root);
	const own = gitConfig(root, [flag, '--get', 'core.hooksPath']);
	if (own !== '' || flag === '--local') return own;
	return gitConfig(root, ['--local', '--get', 'core.hooksPath']);
}
