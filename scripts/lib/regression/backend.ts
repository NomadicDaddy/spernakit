/**
 * The isolated backend each regression case runs against: spawning it on a fresh loopback port with
 * the run's own config, knowing it is ready only from the child itself, and stopping it under
 * deadlines. Split from instance.ts (which keeps the run directory, its config and snapshots) so
 * both stay under the line cap; behaviour is unchanged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Run, writeConfig } from './instance.ts';

const ENTRY = join(import.meta.dir, 'backend-entry.ts');
const HEALTH_DEADLINE_MS = 60_000;
const STOP_DEADLINE_MS = 20_000;

export interface Backend {
	origin: string;
	port: number;
	process: Bun.Subprocess;
}

/** The environment the backend child gets: enough to run, nothing of the developer's. */
function scrubbedEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const name of ['PATH', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
}

/** How long one health request may take before the attempt counts it as unanswered. */
const FETCH_DEADLINE_MS = 2_000;
/** How long a killed child may take to exit before the run gives up on it. */
const KILL_DEADLINE_MS = 5_000;

/** Every backend child this process has started and not yet seen exit. */
const liveBackends = new Set<Bun.Subprocess>();
/** How many backends this process has started, which numbers their logs. */
let backendStarts = 0;

/** Kill every live backend child at once; for an interrupted run, which cannot wait on them. */
export function killLiveBackends(): void {
	for (const child of liveBackends) child.kill('SIGKILL');
}

/** Wait for `child` to exit within `ms`; true when it did. */
async function exitedWithin(child: Bun.Subprocess, ms: number): Promise<boolean> {
	return Promise.race([child.exited.then(() => true), Bun.sleep(ms).then(() => false)]);
}

/** Stop `child`: SIGTERM, then SIGKILL, each waited on under its own deadline. */
async function settle(child: Bun.Subprocess, graceMs: number): Promise<void> {
	child.kill('SIGTERM');
	if (await exitedWithin(child, graceMs)) return;
	child.kill('SIGKILL');
	if (await exitedWithin(child, KILL_DEADLINE_MS)) return;
	throw new Error(`backend process ${String(child.pid)} did not exit after SIGKILL.`);
}

/**
 * Whether the child we started is serving: it wrote its ready file naming its own pid and the
 * port it bound, it is still running, and /api/v1/health answers 200 there. Another listener on
 * the port cannot pass, because only our child writes that file, and only after its own bind.
 */
async function ready(child: Bun.Subprocess, readyFile: string, port: number): Promise<boolean> {
	const deadline = Date.now() + HEALTH_DEADLINE_MS;
	while (Date.now() < deadline && child.exitCode === null) {
		let owned = false;
		try {
			const claim = JSON.parse(readFileSync(readyFile, 'utf8')) as {
				pid?: number;
				port?: number;
			};
			owned = claim.pid === child.pid && claim.port === port;
		} catch {
			// Not written yet.
		}
		if (owned) {
			try {
				const res = await fetch(`http://127.0.0.1:${String(port)}/api/v1/health`, {
					signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
				});
				if (res.ok && child.exitCode === null) return true;
			} catch {
				// Not answering yet, or the request ran past its deadline.
			}
		}
		await Bun.sleep(250);
	}
	return false;
}

/** A port nothing is listening on right now. A lost bind exits the child, and the caller retries. */
function candidatePort(): number {
	const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
	const port = probe.port;
	probe.stop(true);
	return port;
}

/**
 * Start a backend on `dbFile` and wait until the child itself reports it is listening and answers
 * health, under a deadline. A lost bind or a slow start stops that child and retries on a fresh
 * port, up to three times; then the case fails with the log's tail.
 */
export async function startBackend(
	run: Run,
	frontendOrigin: string,
	dbFile: string,
): Promise<Backend> {
	let lastLog = '';
	// Numbered per start, so a restarted backend never writes over the log from before the restart.
	const start = ++backendStarts;
	for (let attempt = 1; attempt <= 3; attempt++) {
		const port = candidatePort();
		writeConfig(run, port, frontendOrigin, dbFile);
		const name = `backend-${dbFile}-start${String(start)}-attempt${String(attempt)}`;
		const logPath = join(run.dir, `${name}.log`);
		const readyFile = join(run.dir, `${name}.ready.json`);
		const child = Bun.spawn(['bun', ENTRY, run.configDir, readyFile], {
			cwd: run.dir,
			env: scrubbedEnv(),
			stderr: Bun.file(logPath),
			stdout: Bun.file(logPath),
			windowsHide: true,
		});
		liveBackends.add(child);
		void child.exited.then(() => liveBackends.delete(child));
		if (await ready(child, readyFile, port)) {
			return { origin: `http://127.0.0.1:${String(port)}`, port, process: child };
		}
		await settle(child, KILL_DEADLINE_MS);
		lastLog = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-2000) : '';
	}
	throw new Error(`the isolated backend never became ready:\n${lastLog}`);
}

/** Stop a backend and wait, under deadlines, for it to exit, so its database file is closed. */
export async function stopBackend(backend: Backend): Promise<void> {
	await settle(backend.process, STOP_DEADLINE_MS);
}
