import { statSync } from 'node:fs';
import { join } from 'node:path';

const HOOKS = ['pre-commit', 'pre-push'] as const;
const HOOKS_DIR = 'scripts/smokestack/hooks';

/** Whether Git points at delivered, executable Smokestack hooks. */
export function hasSmokestackHooksPath(repoRoot: string): boolean {
	const result = Bun.spawnSync(
		['git', '-C', repoRoot, 'config', '--local', '--get', 'core.hooksPath'],
		{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	);
	if (result.exitCode !== 0 || result.stdout.toString().trim() !== HOOKS_DIR) return false;

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
