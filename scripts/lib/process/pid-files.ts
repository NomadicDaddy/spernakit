/**
 * PID file management shared by start.ts and stop.ts.
 *
 * Extracted from scripts/start.ts and scripts/stop.ts. The two scripts use
 * intentionally different read semantics, preserved here as separate exports:
 * - readPidFile (start): lenient Number() parse, never touches the file.
 * - readPidFileOrCleanup (stop): parseInt() parse, removes garbage PID files.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Check if a process with a given PID is alive.
 */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Write a PID file for later process management.
 */
export function writePidFile(logsDir: string, name: string, pid: number): void {
	const pidPath = path.join(logsDir, `${name}.pid`);
	fs.writeFileSync(pidPath, String(pid), 'utf8');
}

/**
 * Read a PID file if it exists (lenient flavor used by start.ts).
 */
export function readPidFile(logsDir: string, name: string): null | number {
	const pidPath = path.join(logsDir, `${name}.pid`);
	if (!fs.existsSync(pidPath)) return null;
	const content = fs.readFileSync(pidPath, 'utf8').trim();
	const pid = Number(content);
	return Number.isFinite(pid) && pid > 0 ? pid : null;
}

/**
 * Remove a PID file.
 */
export function removePidFile(logsDir: string, name: string): void {
	const pidPath = path.join(logsDir, `${name}.pid`);
	try {
		if (fs.existsSync(pidPath)) {
			fs.unlinkSync(pidPath);
		}
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Read a PID from a PID file (stop.ts flavor). Returns null if file missing
 * or PID is stale; removes the file when it contains a garbage PID.
 */
export function readPidFileOrCleanup(logsDir: string, name: string): null | number {
	const pidPath = path.join(logsDir, `${name}.pid`);

	if (!fs.existsSync(pidPath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(pidPath, 'utf8').trim();
		const pid = parseInt(content, 10);

		if (isNaN(pid) || pid <= 0) {
			removePidFile(logsDir, name);
			return null;
		}

		return pid;
	} catch {
		return null;
	}
}

/**
 * Kill a process by PID file if it exists (used by start.ts failure cleanup).
 */
export function killProcessByPidFile(logsDir: string, name: string): void {
	const pid = readPidFile(logsDir, name);
	if (pid) {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			// Process already dead
		}
		const pidPath = path.join(logsDir, `${name}.pid`);
		fs.unlinkSync(pidPath);
	}
}
