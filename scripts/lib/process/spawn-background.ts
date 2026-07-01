/**
 * Detached background process spawning with log redirection, used by start.ts.
 *
 * Extracted from scripts/start.ts.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { writePidFile } from './pid-files.ts';

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
 * Build a minimal environment for child processes instead of inheriting every
 * parent variable, which may include unrelated operator or CI secrets.
 */
function createChildEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};

	for (const key of CHILD_ENV_KEYS) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}

	return env;
}

/**
 * Open a log file descriptor for appending.
 */
function openLogFd(logsDir: string, filename: string): number {
	const logPath = path.join(logsDir, filename);
	return fs.openSync(logPath, 'a');
}

/**
 * Spawn a detached background process with output redirected to log files.
 */
export function spawnBackground(
	logsDir: string,
	name: string,
	command: string,
	args: string[],
	cwd: string
): null | number {
	const stdoutFd = openLogFd(logsDir, `${name}.log`);
	const stderrFd = openLogFd(logsDir, `${name}.error.log`);

	const proc = spawn(command, args, {
		cwd,
		detached: true,
		env: createChildEnv(),
		stdio: ['ignore', stdoutFd, stderrFd],
		windowsHide: true,
	});

	if (!proc.pid) {
		console.error(`   ❌ Failed to start ${name}`);
		fs.closeSync(stdoutFd);
		fs.closeSync(stderrFd);
		return null;
	}

	// Detach from parent — parent can exit without killing children
	proc.unref();

	// Close FDs in parent after handing off to child
	fs.closeSync(stdoutFd);
	fs.closeSync(stderrFd);

	writePidFile(logsDir, name, proc.pid);

	return proc.pid;
}
