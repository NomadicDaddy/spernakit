/** Stop one local service, including listeners missed by the OS port table. */
import { killProcess } from './kill.ts';
import { isProcessAlive, readPidFileOrCleanup, removePidFile } from './pid-files.ts';
import { probeHttpPort } from './ports.ts';

export interface StopServiceOptions {
	findPidOnPort: (port: number) => null | string;
	kill?: (pid: number | string, label: string) => boolean;
	logsDir: string;
	name: string;
	port: number;
}

export interface StopServiceResult {
	failed: boolean;
	killed: boolean;
	stalePid: boolean;
	unresolvedListener: boolean;
}

export async function stopService(options: StopServiceOptions): Promise<StopServiceResult> {
	const { findPidOnPort, logsDir, name, port } = options;
	const kill = options.kill ?? killProcess;
	const result: StopServiceResult = {
		failed: false,
		killed: false,
		stalePid: false,
		unresolvedListener: false,
	};
	let killedViaPidFile = false;

	const filePid = readPidFileOrCleanup(logsDir, name);
	if (filePid !== null) {
		if (isProcessAlive(filePid)) {
			console.log(`   Found ${name} via PID file (PID: ${filePid})`);
			killedViaPidFile = kill(filePid, `${name} port ${port}`);
			result.killed = killedViaPidFile;
			result.failed = !killedViaPidFile && isProcessAlive(filePid);
		} else {
			console.log(
				`   ⚠ Stale PID file for ${name} (PID ${filePid} not running) — cleaning up`,
			);
			result.stalePid = true;
		}
		removePidFile(logsDir, name);
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const portPid = findPidOnPort(port);
		if (!portPid) break;
		console.log(
			attempt === 0 && !killedViaPidFile
				? `   Found ${name} on port ${port} (PID: ${portPid})`
				: `   Orphan ${name} listener on port ${port} (PID: ${portPid})`,
		);
		if (kill(portPid, `${name} port ${port}`)) {
			result.killed = true;
		} else if (isProcessAlive(Number(portPid))) {
			result.failed = true;
		}
		await Bun.sleep(300);
	}

	// A missing port-table row is not proof that the HTTP service is gone on Windows.
	// Check the socket itself, then give PID discovery one more chance before refusing.
	if (await probeHttpPort(port)) {
		const portPid = findPidOnPort(port);
		if (portPid) {
			console.log(`   Found ${name} answering HTTP on port ${port} (PID: ${portPid})`);
			if (kill(portPid, `${name} port ${port}`)) {
				result.killed = true;
			} else if (isProcessAlive(Number(portPid))) {
				result.failed = true;
			}
		}
		if (await probeHttpPort(port)) {
			console.error(
				`   ⚠ ${name} still answers HTTP on port ${port}; listener PID unresolved`,
			);
			result.unresolvedListener = true;
		}
	}

	return result;
}
