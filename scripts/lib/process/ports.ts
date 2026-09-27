/**
 * Port-based process discovery (stop.ts) and readiness polling (start.ts).
 *
 * Extracted from scripts/start.ts and scripts/stop.ts.
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';

/**
 * Find process ID using a port (Windows).
 */
export function findPidOnPortWindows(port: number): null | string {
	try {
		const result = spawnSync('netstat', ['-ano'], {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		if (result.status !== 0 || !result.stdout) {
			return null;
		}

		const lines = result.stdout.split('\n');
		for (const line of lines) {
			const match = line.match(new RegExp(`:\\s*${port}\\s+.*LISTENING\\s+(\\d+)`));
			if (match?.[1]) {
				return match[1];
			}
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Find process ID using a port (Unix/Linux/macOS).
 */
export function findPidOnPortUnix(port: number): null | string {
	try {
		const result = spawnSync('lsof', ['-ti', `:${port}`], {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		if (result.status !== 0 || !result.stdout) {
			return null;
		}

		const pid = result.stdout.trim().split('\n')[0];
		return pid || null;
	} catch {
		return null;
	}
}

/**
 * How long a service that is still running may take to start listening. A cold backend start
 * (right after an install or build, on a loaded machine) spends well over ten seconds loading
 * modules before it writes its first log line; the smoke runbook's own readiness waits allow 30.
 */
export const PORT_CHECK_TIMEOUT_MS = 30_000;
export const PORT_CHECK_INTERVAL_MS = 500;

/** Why a readiness wait ended. `exited` means the watched process died before it listened. */
export type PortWaitResult = 'exited' | 'listening' | 'timeout';

export interface WaitForPortOptions {
	/** Returns false once the watched process has exited, so a crash fails fast instead of waiting out the deadline. */
	isAlive?: () => boolean;
	timeoutMs?: number;
}

/**
 * Wait for a port to accept a TCP connection. A slow start is not a failure while the process is
 * alive; a process that exits before listening is reported at once as `exited`.
 */
export async function waitForPort(
	port: number,
	serviceName: string,
	options: WaitForPortOptions = {},
): Promise<PortWaitResult> {
	const deadline = Date.now() + (options.timeoutMs ?? PORT_CHECK_TIMEOUT_MS);

	while (Date.now() < deadline) {
		if (options.isAlive && !options.isAlive()) return 'exited';
		const socket = new net.Socket();
		const available = await new Promise<boolean>((resolve) => {
			socket.setTimeout(PORT_CHECK_INTERVAL_MS);
			socket.once('connect', () => {
				socket.destroy();
				resolve(true);
			});
			socket.once('error', () => {
				socket.destroy();
				resolve(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, '127.0.0.1');
		});

		if (available) {
			console.log(`   ✓ ${serviceName} listening on port ${port}`);
			return 'listening';
		}
		// A refused connection returns at once; pause so the wait does not spin on the CPU the
		// starting service needs.
		await new Promise((done) => setTimeout(done, PORT_CHECK_INTERVAL_MS));
	}

	return 'timeout';
}
