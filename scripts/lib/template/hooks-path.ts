/** Whether the app's own Git configuration points hooks at the Smokestack delivery. */
export function hasSmokestackHooksPath(repoRoot: string): boolean {
	const result = Bun.spawnSync(
		['git', '-C', repoRoot, 'config', '--local', '--get', 'core.hooksPath'],
		{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	);
	return result.exitCode === 0 && result.stdout.toString().trim() === 'scripts/smokestack/hooks';
}
