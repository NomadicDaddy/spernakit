import { statSync } from 'node:fs';
import { join } from 'node:path';

import { effectiveHooksPath } from './git-hooks-scope.ts';

const HOOKS = ['pre-commit', 'pre-push'] as const;
const HOOKS_DIR = 'scripts/smokestack/hooks';

/**
 * Whether Git points this checkout at delivered, executable Smokestack hooks. The hooks path is
 * read the way git dispatches it: a linked worktree's own value under `extensions.worktreeConfig`
 * first, then the shared one, so an upgrade worktree and its main checkout are each judged by the
 * hooks they actually run.
 */
export function hasSmokestackHooksPath(repoRoot: string): boolean {
	if (effectiveHooksPath(repoRoot) !== HOOKS_DIR) return false;

	const paths = HOOKS.map((hook) => `${HOOKS_DIR}/${hook}`);
	const indexed = Bun.spawnSync(['git', '-C', repoRoot, 'ls-files', '--stage', '--', ...paths], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (indexed.exitCode !== 0) return false;
	const executablePaths = new Set(
		indexed.stdout
			.toString()
			.split(/\r?\n/)
			.map((line) => /^100755 [a-f0-9]+ 0\t(.+)$/.exec(line)?.[1])
			.filter((path): path is string => path !== undefined),
	);
	return paths.every((path) => {
		try {
			return executablePaths.has(path) && statSync(join(repoRoot, path)).isFile();
		} catch {
			return false;
		}
	});
}
