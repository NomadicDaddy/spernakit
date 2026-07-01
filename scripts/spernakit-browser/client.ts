import { existsSync } from 'node:fs';
/**
 * CLI client for the spernakit-browser daemon.
 *
 * Handles daemon health check, auto-start, and IPC communication.
 */
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DaemonInfo, IpcRequest, IpcResponse } from './types';

// ---------------------------------------------------------------------------
// Daemon discovery
// ---------------------------------------------------------------------------

function getDaemonDir(): string {
	return path.join(tmpdir(), 'spernakit-browser');
}

function getPidFilePath(): string {
	return path.join(getDaemonDir(), 'daemon.pid');
}

/** Read daemon info from PID file. Returns null if not found or stale. */
async function readDaemonInfo(): Promise<DaemonInfo | null> {
	const pidPath = getPidFilePath();
	if (!existsSync(pidPath)) return null;

	try {
		const info: DaemonInfo = JSON.parse(await Bun.file(pidPath).text());

		// Check if the process is alive
		process.kill(info.pid, 0);
		return info;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Daemon auto-start
// ---------------------------------------------------------------------------

/** Start the daemon as a background process. Returns the DaemonInfo once it's ready. */
async function startDaemon(): Promise<DaemonInfo> {
	const daemonScript = path.resolve(import.meta.dir, 'daemon.ts');

	const logDir = getDaemonDir();
	const { mkdirSync, openSync } = await import('node:fs');
	const { spawn: nodeSpawn } = await import('node:child_process');
	mkdirSync(logDir, { recursive: true });

	// Use Node's child_process.spawn with detached:true so daemon survives client exit
	const logPath = path.join(logDir, 'daemon.log');
	const logFd = openSync(logPath, 'a');

	const proc = nodeSpawn('bun', ['run', daemonScript], {
		cwd: import.meta.dir,
		detached: true,
		stdio: ['ignore', logFd, logFd],
	});

	proc.unref();

	// Wait for daemon to create its PID file (up to 15 seconds for browser launch)
	for (let i = 0; i < 30; i++) {
		await Bun.sleep(500);
		const info = await readDaemonInfo();
		if (info) {
			// Verify daemon is responsive
			try {
				const response = await sendCommand(info.port, {
					args: [],
					command: 'ping',
					session: 'default',
				});
				if (response.ok) return info;
			} catch {
				// Not ready yet
			}
		}
	}

	throw new Error(`Daemon failed to start within 15 seconds. Check logs at ${logPath}`);
}

// ---------------------------------------------------------------------------
// IPC communication
// ---------------------------------------------------------------------------

/** Send a command to the daemon and wait for the response. */
export async function sendCommand(port: number, request: IpcRequest): Promise<IpcResponse> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
			const json = JSON.stringify(request);
			const header = `Content-Length: ${Buffer.byteLength(json)}\n\n`;
			socket.write(header + json);
		});

		let buffer = '';
		let resolved = false;

		socket.on('data', (data) => {
			buffer += data.toString();

			const headerEnd = buffer.indexOf('\n\n');
			if (headerEnd === -1) return;

			const header = buffer.substring(0, headerEnd);
			const match = header.match(/Content-Length:\s*(\d+)/i);
			if (!match) {
				if (!resolved) {
					resolved = true;
					reject(new Error('Invalid response from daemon'));
				}
				socket.end();
				return;
			}

			const contentLength = parseInt(match[1] ?? '0', 10);
			const bodyStart = headerEnd + 2;
			const available = Buffer.byteLength(buffer.substring(bodyStart));

			if (available < contentLength) return;

			const body = buffer.substring(bodyStart, bodyStart + contentLength);

			try {
				const response = JSON.parse(body) as IpcResponse;
				if (!resolved) {
					resolved = true;
					resolve(response);
				}
			} catch {
				if (!resolved) {
					resolved = true;
					reject(new Error('Invalid JSON response from daemon'));
				}
			}

			socket.end();
		});

		socket.on('error', (err) => {
			if (!resolved) {
				resolved = true;
				reject(err);
			}
		});

		socket.setTimeout(60_000, () => {
			if (!resolved) {
				resolved = true;
				reject(new Error('Daemon response timeout'));
			}
			socket.end();
		});
	});
}

// ---------------------------------------------------------------------------
// Public API — ensures daemon is running, then sends command
// ---------------------------------------------------------------------------

/** Execute a command, starting the daemon if needed. */
export async function executeCommand(request: IpcRequest): Promise<IpcResponse> {
	let info = await readDaemonInfo();

	if (!info) {
		info = await startDaemon();
	}

	try {
		return await sendCommand(info.port, request);
	} catch (err) {
		// Daemon might have died — try restarting once
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET')) {
			info = await startDaemon();
			return sendCommand(info.port, request);
		}
		throw err;
	}
}
