#!/usr/bin/env bun
/**
 * Regression coverage for the start launcher's readiness wait (`scripts/lib/process/ports.ts`).
 *
 * A cold backend start on a loaded machine spends over ten seconds loading modules before it
 * writes a log line. The launcher used to give up at ten seconds, kill the still-healthy process
 * and report "failed to start" with empty logs, which is indistinguishable from a crash. This
 * checks that the wait tells the cases apart:
 *  1. a process that has exited is reported as `exited` at once, not after the deadline;
 *  2. a listening port is reported as `listening`;
 *  3. a live process that never listens is reported as `timeout`, and not before the deadline;
 *  4. the launcher's deadline is not shorter than the smoke runbook's own readiness wait, so the
 *     runbook's 30 s allowance is never cut short by `bun run start` itself.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isProcessAlive } from './lib/process/pid-files.ts';
import { PORT_CHECK_TIMEOUT_MS, waitForPort } from './lib/process/ports.ts';

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

	// --- 4. the launcher never cuts the runbook's own readiness wait short ---
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
			'[OK] wait-for-port: exited, listening and timeout are told apart; no early give-up',
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
