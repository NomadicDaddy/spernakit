import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
/**
 * spernakit-browser daemon — TCP server that holds browser state in memory.
 *
 * Listens on localhost for JSON commands, dispatches to browser/snapshot/actions,
 * auto-shuts down after idle timeout.
 *
 * IPC protocol: content-length framing
 *   Request:  "Content-Length: <n>\n\n<JSON payload>"
 *   Response: "Content-Length: <n>\n\n<JSON payload>"
 */
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DaemonInfo, IpcRequest, IpcResponse } from './types';

import { handleCommand } from './daemon-handlers.ts';
import { closeAllSessions } from './daemon-sessions.ts';
import { DAEMON_PORT, IDLE_TIMEOUT_MS } from './types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let idleTimer: null | ReturnType<typeof setTimeout> = null;
let server: net.Server | null = null;

// ---------------------------------------------------------------------------
// PID file management
// ---------------------------------------------------------------------------

function getDaemonDir(): string {
	return path.join(tmpdir(), 'spernakit-browser');
}

function getPidFilePath(): string {
	return path.join(getDaemonDir(), 'daemon.pid');
}

function writePidFile(port: number): void {
	const dir = getDaemonDir();
	mkdirSync(dir, { recursive: true });

	const info: DaemonInfo = {
		pid: process.pid,
		port,
		startedAt: new Date().toISOString(),
	};
	writeFileSync(getPidFilePath(), JSON.stringify(info, null, '\t'));
}

function removePidFile(): void {
	try {
		unlinkSync(getPidFilePath());
	} catch {
		// File may already be gone
	}
}

// ---------------------------------------------------------------------------
// Idle timeout
// ---------------------------------------------------------------------------

function resetIdleTimer(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(async () => {
		console.log('[daemon] Idle timeout reached, shutting down...');
		await shutdown();
	}, IDLE_TIMEOUT_MS);
}

async function shutdown(): Promise<void> {
	if (idleTimer) clearTimeout(idleTimer);
	await closeAllSessions();
	removePidFile();

	if (server) {
		server.close();
		server = null;
	}

	process.exit(0);
}

// ---------------------------------------------------------------------------
// IPC protocol: content-length framing
// ---------------------------------------------------------------------------

function sendResponse(socket: net.Socket, response: IpcResponse): void {
	const json = JSON.stringify(response);
	const header = `Content-Length: ${Buffer.byteLength(json)}\n\n`;
	socket.write(header + json);
}

function handleConnection(socket: net.Socket): void {
	let buffer = '';

	socket.on('data', (data) => {
		buffer += data.toString();
		processBuffer(socket);
	});

	function processBuffer(sock: net.Socket): void {
		// Look for content-length header
		const headerEnd = buffer.indexOf('\n\n');
		if (headerEnd === -1) return;

		const header = buffer.substring(0, headerEnd);
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			sendResponse(sock, { error: 'Invalid IPC header', ok: false });
			buffer = '';
			return;
		}

		const contentLength = parseInt(match[1] ?? '0', 10);
		const bodyStart = headerEnd + 2;
		const available = Buffer.byteLength(buffer.substring(bodyStart));

		if (available < contentLength) return; // Wait for more data

		const body = buffer.substring(bodyStart, bodyStart + contentLength);
		buffer = buffer.substring(bodyStart + contentLength);

		resetIdleTimer();

		let request: IpcRequest;
		try {
			request = JSON.parse(body) as IpcRequest;
		} catch {
			sendResponse(sock, { error: 'Invalid JSON', ok: false });
			return;
		}

		handleCommand(request, shutdown)
			.then((response) => sendResponse(sock, response))
			.catch((err) => {
				const msg = err instanceof Error ? err.message : String(err);
				sendResponse(sock, { error: `Internal error: ${msg}`, ok: false });
			});
	}

	socket.on('error', () => {
		// Client disconnected — nothing to do
	});
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

async function findAvailablePort(startPort: number): Promise<number> {
	return new Promise((resolve, reject) => {
		const tester = net.createServer();
		tester.once('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				resolve(findAvailablePort(startPort + 1));
			} else {
				reject(err);
			}
		});
		tester.once('listening', () => {
			const addr = tester.address() as net.AddressInfo;
			tester.close(() => resolve(addr.port));
		});
		tester.listen(startPort, '127.0.0.1');
	});
}

export async function startDaemon(): Promise<void> {
	const port = await findAvailablePort(DAEMON_PORT);

	// Check if there's already a daemon running
	const pidPath = getPidFilePath();
	if (existsSync(pidPath)) {
		try {
			const info: DaemonInfo = JSON.parse(await Bun.file(pidPath).text());
			// Check if that process is still alive
			process.kill(info.pid, 0);
			console.error(`Daemon already running (pid ${info.pid}, port ${info.port})`);
			process.exit(1);
		} catch {
			// Process is dead — clean up stale PID file
			removePidFile();
		}
	}

	server = net.createServer(handleConnection);

	server.listen(port, '127.0.0.1', () => {
		writePidFile(port);
		resetIdleTimer();
		console.log(`[daemon] Listening on 127.0.0.1:${port} (pid ${process.pid})`);
	});

	server.on('error', (err) => {
		console.error(`[daemon] Server error: ${err.message}`);
		process.exit(1);
	});

	// Graceful shutdown on signals
	process.on('SIGINT', () => shutdown());
	process.on('SIGTERM', () => shutdown());
}

// ---------------------------------------------------------------------------
// Direct entry point (run as: bun daemon.ts)
// ---------------------------------------------------------------------------

if (import.meta.main) {
	startDaemon().catch((err) => {
		console.error(`Failed to start daemon: ${err}`);
		process.exit(1);
	});
}
