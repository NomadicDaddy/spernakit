/**
 * Shell selection and command rewriting for smoke test steps.
 */

export function getShell(): string[] {
	if (process.platform === 'win32') {
		try {
			const pwshCheck = Bun.spawnSync([
				'pwsh',
				'-NoLogo',
				'-NoProfile',
				'-Command',
				'exit 0',
			]);
			if (pwshCheck.success) {
				return ['pwsh', '-NoLogo', '-NoProfile', '-Command'];
			}
		} catch {
			// pwsh not available
		}
		return ['cmd', '/c'];
	}
	return ['bash', '-c'];
}

// Rewrite leading `bun ` (and `bun` after `&&`/`||`/`;`/`|`) to the absolute
// path of the currently-running Bun executable. This sidesteps PATH/PATHEXT
// resolution in child shells — pwsh -NoProfile in particular won't always
// resolve `bun` to `bun.exe`, even when `.bun\bin` is on PATH, and the failure
// is a non-terminating error so it can't be detected by exit code alone.
export function rewriteBunCommand(command: string): string {
	if (process.platform !== 'win32') return command;
	const bunPath = process.execPath;
	const quoted = bunPath.includes(' ') ? `"${bunPath}"` : bunPath;
	return command.replace(/(^|[\s&|;])bun(\s)/g, `$1${quoted}$2`);
}
