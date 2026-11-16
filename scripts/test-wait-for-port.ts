#!/usr/bin/env bun
/**
 * Regression coverage for start readiness and stop's unreliable port-table fallback.
 *
 * A cold backend start on a loaded machine spends over ten seconds loading modules before it
 * writes a log line. The launcher used to give up at ten seconds, kill the still-healthy process
 * and report "failed to start" with empty logs, which is indistinguishable from a crash. This
 * checks that the wait tells the cases apart:
 *  1. a process that has exited is reported as `exited` at once, not after the deadline;
 *  2. a listening port is reported as `listening`;
 *  3. a live process that never listens is reported as `timeout`, and not before the deadline;
 *  4. a missed port-table row does not hide an answering HTTP listener; stop kills it when the
 *     PID becomes available and refuses to claim success when it stays unresolved;
 *  5. the launcher's deadline is not shorter than the smoke runbook's own readiness wait, so the
 *     runbook's 30 s allowance is never cut short by `bun run start` itself.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isProcessAlive } from './lib/process/pid-files.ts';
import { PORT_CHECK_TIMEOUT_MS, waitForPort } from './lib/process/ports.ts';
import { stopService } from './lib/process/stop-service.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** A port that nothing listens on: bound once to learn a free number, then released. */
async function freePort(): Promise<number> {
	const server = net.createServer();
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	const port = typeof address === 'object' && address !== null ? address.port : 0;
	await new Promise<void>((done) => server.close(() => done()));
	return port;
}

async function run(): Promise<void> {
	// --- 1. an exited process fails fast ---
	const finished = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
	const deadPid = finished.pid ?? 0;
	const idlePort = await freePort();
	let started = Date.now();
	const exited = await waitForPort(idlePort, 'Dead', {
		isAlive: () => deadPid > 0 && isProcessAlive(deadPid),
		timeoutMs: 20_000,
	});
	assert(exited === 'exited', `an exited process must report exited, got ${exited}`);
	assert(
		Date.now() - started < 3_000,
		'an exited process must be reported without waiting out the deadline',
	);

	// --- 2. a listening port is found ---
	const server = net.createServer();
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	const livePort = typeof address === 'object' && address !== null ? address.port : 0;
	const listening = await waitForPort(livePort, 'Live', {
		isAlive: () => true,
		timeoutMs: 5_000,
	});
	assert(listening === 'listening', `a listening port must report listening, got ${listening}`);
	await new Promise<void>((done) => server.close(() => done()));

	// --- 3. a live process that never listens times out, and not early ---
	started = Date.now();
	const timedOut = await waitForPort(idlePort, 'Slow', { isAlive: () => true, timeoutMs: 1_500 });
	const elapsed = Date.now() - started;
	assert(
		timedOut === 'timeout',
		`a live process that never listens must report timeout, got ${timedOut}`,
	);
	assert(elapsed >= 1_500, `the timeout must not fire early (${String(elapsed)} ms)`);

	// --- 4. a live HTTP listener is found even when the first OS port lookup misses ---
	const logsDir = mkdtempSync(join(tmpdir(), 'spernakit-stop-port-'));
	const listenerCode =
		"Bun.serve({hostname:'127.0.0.1',port:Number(process.env.STOP_TEST_PORT),fetch(){return new Response('ok')}})";
	try {
		const port = await freePort();
		const listener = Bun.spawn([process.execPath, '-e', listenerCode], {
			env: { STOP_TEST_PORT: String(port) },
			stderr: 'pipe',
			stdout: 'pipe',
		});
		try {
			const ready = await waitForPort(port, 'Stop test', { timeoutMs: 5_000 });
			assert(ready === 'listening', 'the stop-test child must start listening');
			let lookups = 0;
			const stopped = await stopService({
				findPidOnPort: () => (++lookups === 1 ? null : String(listener.pid)),
				logsDir,
				name: 'backend',
				port,
			});
			assert(stopped.killed, 'the HTTP fallback must stop a listener with no PID file');
			assert(!stopped.unresolvedListener, 'a resolved listener must not be refused');
			if (stopped.killed) {
				const exited = await Promise.race([
					listener.exited.then(() => true),
					Bun.sleep(5_000).then(() => false),
				]);
				assert(exited, 'the fallback must make the listener exit promptly');
				assert(
					!isProcessAlive(listener.pid),
					'the fallback must terminate the listener process',
				);
			}
		} finally {
			if (isProcessAlive(listener.pid)) listener.kill();
			await listener.exited;
		}

		const unresolvedPort = await freePort();
		const unresolved = Bun.spawn([process.execPath, '-e', listenerCode], {
			env: { STOP_TEST_PORT: String(unresolvedPort) },
			stderr: 'pipe',
			stdout: 'pipe',
		});
		try {
			const ready = await waitForPort(unresolvedPort, 'Unresolved test', {
				timeoutMs: 5_000,
			});
			assert(ready === 'listening', 'the unresolved-test child must start listening');
			const result = await stopService({
				findPidOnPort: () => null,
				logsDir,
				name: 'backend',
				port: unresolvedPort,
			});
			assert(result.unresolvedListener, 'an answering port without a PID must be refused');
			assert(!result.killed, 'an unresolved listener must not be reported stopped');
			assert(
				isProcessAlive(unresolved.pid),
				'the unresolved listener must not be killed blindly',
			);
		} finally {
			unresolved.kill();
			await unresolved.exited;
		}
		const absent = await stopService({
			findPidOnPort: () => null,
			logsDir,
			name: 'backend',
			port: await freePort(),
		});
		assert(
			!absent.killed && !absent.unresolvedListener,
			'an absent listener must remain absent',
		);
		// The earlier child PID can be reused while the real listener checks run. Use a positive
		// signed-32-bit sentinel and verify it is absent instead of relying on that old PID.
		const absentPid = 2_147_483_647;
		assert(!isProcessAlive(absentPid), 'the synthetic exited-PID fixture must be absent');
		let deadLookups = 0;
		let deadKillAttempts = 0;
		const alreadyExited = await stopService({
			findPidOnPort: () => (++deadLookups === 1 ? String(absentPid) : null),
			kill: () => {
				deadKillAttempts++;
				return false;
			},
			logsDir,
			name: 'backend',
			port: await freePort(),
		});
		assert(deadKillAttempts === 1, 'the exited-PID race must exercise a failed kill');
		assert(!alreadyExited.failed, 'a process that exits before kill must not fail stop');
		let liveLookups = 0;
		const stillAlive = await stopService({
			findPidOnPort: () => (++liveLookups === 1 ? String(process.pid) : null),
			// Never kill the test process: a refused kill of a known-live PID must stay a failure.
			kill: () => false,
			logsDir,
			name: 'backend',
			port: await freePort(),
		});
		assert(stillAlive.failed, 'a failed kill of a live process must fail stop');
	} finally {
		rmSync(logsDir, { force: true, recursive: true });
	}

	// --- 5. the launcher never cuts the runbook's own readiness wait short ---
	const smoke = readFileSync(join(repoRoot, 'scripts', 'smoke.json'), 'utf8');
	const waits = [
		...smoke.matchAll(
			/wait-for-http\.ts --url http:\/\/localhost:\{\{BACKEND_PORT\}\}[^"]*--timeoutMs (\d+)/g,
		),
	];
	assert(
		waits.length > 0,
		'smoke.json no longer has a backend wait-for-http step; update this check',
	);
	for (const match of waits) {
		const runbookMs = Number(match[1]);
		assert(
			PORT_CHECK_TIMEOUT_MS >= runbookMs,
			`start.ts gives up after ${String(PORT_CHECK_TIMEOUT_MS)} ms, before the runbook's ${String(runbookMs)} ms backend wait`,
		);
	}

	if (failures.length === 0) {
		console.log(
			'[OK] process ports: readiness and stop fallback distinguish live and absent ports',
		);
		process.exit(0);
	}
	console.error('[FAIL] wait-for-port:');
	for (const f of failures) console.error(' -', f);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-wait-for-port:', err);
	process.exit(1);
});
