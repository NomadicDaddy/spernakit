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

export const PORT_CHECK_TIMEOUT_MS = 10_000;
export const PORT_CHECK_INTERVAL_MS = 500;

/**
 * Wait for a port to become available (TCP connection succeeds).
 * Returns true if port is available within timeout, false otherwise.
 */
export async function waitForPort(port: number, serviceName: string): Promise<boolean> {
	const deadline = Date.now() + PORT_CHECK_TIMEOUT_MS;

	while (Date.now() < deadline) {
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
			return true;
		}
	}

	return false;
}
