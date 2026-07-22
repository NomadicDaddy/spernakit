/**
 * Process termination helpers used by stop.ts.
 *
 * Extracted from scripts/stop.ts.
 */
import { execSync } from 'node:child_process';

import { isProcessAlive } from './pid-files.ts';

/**
 * Wait for a process to exit, checking every 500ms.
 * @returns true if the process exited within the timeout.
 */
export function waitForExit(pid: number, timeoutMs: number): boolean {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (!isProcessAlive(pid)) return true;
		// Bun.sleepSync works on every supported platform, including Windows.
		Bun.sleepSync(500);
	}
	return !isProcessAlive(pid);
}

/** Graceful-shutdown budget before escalating to a forced kill. Matches the
 * app's 15s shutdown budget (drain sockets, flush logs, close DB). */
const GRACEFUL_EXIT_TIMEOUT_MS = 15_000;

/**
 * Kill a process by PID. Sends SIGTERM first, waits up to the app's 15s
 * shutdown budget, then escalates to SIGKILL.
 */
export function killProcess(pid: number | string, label: string): boolean {
	const isWindows = process.platform === 'win32';
	const pidNum = Number(pid);
	const pidStr = String(pid);

	try {
		if (isWindows) {
			// Windows has no SIGTERM equivalent for console processes: `taskkill`
			// without /F posts WM_CLOSE, which only windowed apps handle — bun/node
			// console processes ignore it. We still attempt the graceful form first
			// (harmless if ignored, lets windowed children close cleanly), wait
			// briefly, then force-kill the tree as the reliable path.
			try {
				execSync(`taskkill /T /PID ${pidStr}`, { stdio: 'pipe' });
			} catch {
				// Expected for console processes — fall through to forced kill.
			}
			if (!waitForExit(pidNum, 2_000)) {
				execSync(`taskkill /F /T /PID ${pidStr}`, { stdio: 'pipe' });
			}
		} else {
			// Graceful shutdown: SIGTERM first
			execSync(`kill -15 ${pidStr}`, { stdio: 'pipe' });
			if (!waitForExit(pidNum, GRACEFUL_EXIT_TIMEOUT_MS)) {
				// Escalate to SIGKILL after the graceful budget elapses
				console.log(`   ⚠ Process ${pidStr} did not exit after SIGTERM, sending SIGKILL`);
				execSync(`kill -9 ${pidStr}`, { stdio: 'pipe' });
			}
		}
		console.log(`   ✓ Stopped process ${pidStr} (${label})`);
		return true;
	} catch {
		console.log(`   ⚠ Could not stop process ${pidStr} (${label})`);
		return false;
	}
}
