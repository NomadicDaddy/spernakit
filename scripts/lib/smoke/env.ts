/**
 * Child process environment construction for smoke test steps.
 */

const CHILD_ENV_KEYS = [
	'APP_SLUG',
	'APP_VERSION',
	'APPDATA',
	'APPDATA_ROOT',
	'BACKEND_PORT',
	'BACKUPS_ROOT',
	'BUN_INSTALL',
	'COMSPEC',
	'CONFIG_DIR',
	'FRONTEND_PORT',
	'HOME',
	'LOCALAPPDATA',
	'NODE_ENV',
	'PATH',
	'PATHEXT',
	'Path',
	'PROGRAMDATA',
	'PROGRAMFILES',
	'PROGRAMFILES(X86)',
	'PSMODULEPATH',
	'SYSTEMDRIVE',
	'SYSTEMROOT',
	'TEMP',
	'TMP',
	'USERPROFILE',
	'WINDIR',
] as const;

/**
 * Build a minimal environment for child commands after loadConfig() has set the
 * runtime variables smoke modes intentionally pass to Docker and Bun processes.
 */
export function createChildEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};

	for (const key of CHILD_ENV_KEYS) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}

	return env;
}
