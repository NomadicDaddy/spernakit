/**
 * An isolated, throwaway instance of the application for the regression suite.
 *
 * Nothing here touches the developer's app: each run lives in `data/regression-suite/<run-id>/`
 * (ASSERT-010 keeps every database under data/), with its own config directory and generated keys
 * read through initializeConfig's `configDirOverride`, a loopback host on its own ports, outbound
 * integrations and rate limiting off, a scrubbed environment and that directory as the working
 * directory, so neither the repository's config/ nor its `.env` is ever read.
 */
import { Database } from 'bun:sqlite';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { generateKeys } from '../setup/keys.ts';

export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
export const RUNS_DIR = join(REPO_ROOT, 'data', 'regression-suite');
const ENTRY = join(import.meta.dir, 'backend-entry.ts');
const HEALTH_DEADLINE_MS = 60_000;
const STOP_DEADLINE_MS = 20_000;
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export interface Run {
	configDir: string;
	dir: string;
	id: string;
	/** Generated once per run, so a restarted backend still accepts the session it issued. */
	keys: ReturnType<typeof generateKeys>;
	slug: string;
}

export interface Backend {
	origin: string;
	port: number;
	process: Bun.Subprocess;
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove run directories a crashed run left behind, and only those: the owner process is gone and
 * the directory is over an hour old. Anything else may be a concurrent run, so it is reported.
 */
export function removeAbandonedRuns(): string[] {
	const kept: string[] = [];
	if (!existsSync(RUNS_DIR)) return kept;
	for (const name of readdirSync(RUNS_DIR)) {
		const dir = join(RUNS_DIR, name);
		let owner: { pid?: number } = {};
		try {
			owner = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) as { pid?: number };
		} catch {
			// No readable owner: treat it as not ours to judge.
		}
		const old = Date.now() - statSync(dir).mtimeMs > ABANDONED_AFTER_MS;
		if (typeof owner.pid === 'number' && !isAlive(owner.pid) && old) {
			rmSync(dir, { force: true, recursive: true });
		} else {
			kept.push(name);
		}
	}
	return kept;
}

/** Make the run directory and its config: template defaults, loopback, generated keys. */
export function createRun(): Run {
	const id = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
	const dir = join(RUNS_DIR, id);
	const configDir = join(dir, 'config');
	mkdirSync(configDir, { recursive: true });
	writeFileSync(join(dir, 'owner.json'), JSON.stringify({ pid: process.pid }));
	const defaults = JSON.parse(
		readFileSync(join(REPO_ROOT, 'backend', 'src', 'config', 'defaults.json'), 'utf8'),
	) as { app: { slug: string } };
	return { configDir, dir, id, keys: generateKeys(), slug: defaults.app.slug };
}

/** Write the run's config for one backend on `port`, its DB file at `dbFile` inside the run. */
export function writeConfig(run: Run, port: number, frontendOrigin: string, dbFile: string): void {
	const defaults = JSON.parse(
		readFileSync(join(REPO_ROOT, 'backend', 'src', 'config', 'defaults.json'), 'utf8'),
	) as Record<string, Record<string, unknown>>;
	const { keys } = run;
	const security = { ...defaults.security };
	security.appApiKey = keys.appApiKey;
	security.cookieSecret = keys.cookieSecret;
	security.encryptionKey = keys.encryptionKey;
	security.jwtPrivateKey = keys.jwtKeyPair.privateKey;
	security.jwtPublicKey = keys.jwtKeyPair.publicKey;
	security.jwtRefreshPrivateKey = keys.jwtRefreshKeyPair.privateKey;
	security.jwtRefreshPublicKey = keys.jwtRefreshKeyPair.publicKey;
	security.mfaPrivateKey = keys.mfaKeyPair.privateKey;
	security.mfaPublicKey = keys.mfaKeyPair.publicKey;
	const relativeDb = `./data/regression-suite/${run.id}/${dbFile}`;
	const config = {
		...defaults,
		cors: { ...defaults.cors, allowedOrigins: [], frontendDevOrigins: [frontendOrigin] },
		database: {
			...defaults.database,
			backup: { ...(defaults.database?.backup as object), enabled: false },
			url: `file:${relativeDb}`,
		},
		logging: {
			...defaults.logging,
			file: {
				...(defaults.logging?.file as object),
				path: join(run.dir, `${dbFile}.app.log`),
			},
		},
		rateLimit: { ...defaults.rateLimit, enabled: false },
		security,
		server: {
			...defaults.server,
			backendPort: port,
			backendUrl: `http://127.0.0.1:${String(port)}`,
			frontendUrl: frontendOrigin,
			host: '127.0.0.1',
			nodeEnv: 'development',
		},
	};
	writeFileSync(join(run.configDir, `${run.slug}.json`), JSON.stringify(config, null, '\t'), {
		mode: 0o600,
	});
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

async function healthy(origin: string, deadline: number): Promise<boolean> {
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${origin}/api/v1/health`);
			if (res.ok) return true;
		} catch {
			// Not listening yet.
		}
		await Bun.sleep(250);
	}
	return false;
}

/** A port nothing is listening on right now. The caller retries if the backend loses the race. */
function candidatePort(): number {
	const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
	const port = probe.port;
	probe.stop(true);
	return port;
}

/**
 * Start a backend on `dbFile` and wait for /api/v1/health under a deadline. A bind race or a slow
 * start retries on a fresh port, up to three times; then the case fails with the log's tail.
 */
export async function startBackend(
	run: Run,
	frontendOrigin: string,
	dbFile: string,
): Promise<Backend> {
	let lastLog = '';
	for (let attempt = 1; attempt <= 3; attempt++) {
		const port = candidatePort();
		writeConfig(run, port, frontendOrigin, dbFile);
		const logPath = join(run.dir, `backend-${dbFile}-${String(attempt)}.log`);
		const child = Bun.spawn(['bun', ENTRY, run.configDir], {
			cwd: run.dir,
			env: scrubbedEnv(),
			stderr: Bun.file(logPath),
			stdout: Bun.file(logPath),
			windowsHide: true,
		});
		const origin = `http://127.0.0.1:${String(port)}`;
		if (await healthy(origin, Date.now() + HEALTH_DEADLINE_MS))
			return { origin, port, process: child };
		child.kill();
		await child.exited;
		lastLog = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-2000) : '';
	}
	throw new Error(`the isolated backend never answered /api/v1/health:\n${lastLog}`);
}

/** Stop a backend and wait for it to exit, so its database file is closed. */
export async function stopBackend(backend: Backend): Promise<void> {
	backend.process.kill('SIGTERM');
	const exited = await Promise.race([
		backend.process.exited.then(() => true),
		Bun.sleep(STOP_DEADLINE_MS).then(() => false),
	]);
	if (!exited) {
		backend.process.kill('SIGKILL');
		await backend.process.exited;
	}
}

/** Checkpoint the seeded snapshot's WAL and refuse to copy while one remains. */
export function freezeSnapshot(run: Run, file: string): void {
	const path = join(run.dir, file);
	const db = new Database(path);
	db.run('PRAGMA wal_checkpoint(TRUNCATE)');
	db.close();
	for (const side of ['-wal', '-shm']) {
		if (existsSync(`${path}${side}`)) {
			const size = statSync(`${path}${side}`).size;
			if (size > 0)
				throw new Error(
					`${file}${side} still holds ${String(size)} bytes after the checkpoint.`,
				);
			rmSync(`${path}${side}`, { force: true });
		}
	}
}

export function copySnapshot(run: Run, from: string, to: string): void {
	copyFileSync(join(run.dir, from), join(run.dir, to));
}

export function removeRun(run: Run): void {
	rmSync(run.dir, { force: true, recursive: true });
}
