/**
 * An isolated, throwaway instance of the application for the regression suite.
 *
 * Nothing here touches the developer's app: each run lives in `data/regression-suite/<run-id>/`
 * (ASSERT-010 keeps every database under data/), with its own config directory and generated keys
 * read through initializeConfig's `configDirOverride`, a loopback host on its own ports, outbound
 * integrations and rate limiting off, a scrubbed environment and that directory as the working
 * directory, so neither the repository's config/ nor its `.env` is ever read.
 *
 * This file owns the run directory, its config and the seeded snapshot; the backend process that
 * runs in it (spawn, readiness, stop) lives in backend.ts.
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
import { removeRunDir } from './cleanup.ts';

export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
export const RUNS_DIR = join(REPO_ROOT, 'data', 'regression-suite');
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export interface Run {
	configDir: string;
	dir: string;
	id: string;
	/** Generated once per run, so a restarted backend still accepts the session it issued. */
	keys: ReturnType<typeof generateKeys>;
	slug: string;
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
 * Remove run directories a crashed run left behind, and only those: the owner is gone and the run
 * is over an hour old by owner.json. Anything else may be a concurrent run, so it is reported.
 */
export function removeAbandonedRuns(): string[] {
	const kept: string[] = [];
	if (!existsSync(RUNS_DIR)) return kept;
	for (const name of readdirSync(RUNS_DIR)) {
		const dir = join(RUNS_DIR, name);
		// Aged by owner.json, written once at createRun and removed last: a partial removal bumps
		// the directory's own mtime, which would restart the hour every time it is retried. Read and
		// stat in one guard: a concurrent cleanup may remove the marker at any moment.
		let owner: { pid?: number } = {};
		let old = false;
		try {
			const ownerFile = join(dir, 'owner.json');
			owner = JSON.parse(readFileSync(ownerFile, 'utf8')) as { pid?: number };
			old = Date.now() - statSync(ownerFile).mtimeMs > ABANDONED_AFTER_MS;
		} catch {
			// No readable owner, or it vanished: not ours to judge, so the directory is skipped.
		}
		if (typeof owner.pid === 'number' && !isAlive(owner.pid) && old) {
			const failed = removeRunDir(dir);
			if (failed.length > 0) kept.push(`${name} (could not remove: ${failed.join('; ')})`);
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
			// The public URL, which is the token issuer. In production nginx serves both on one
			// origin that outlives a restart; here the frontend proxy plays that part. A restarted
			// backend gets a fresh port, so naming its own port would reject every session it issued.
			backendUrl: frontendOrigin,
			frontendUrl: frontendOrigin,
			host: '127.0.0.1',
			nodeEnv: 'development',
		},
	};
	writeFileSync(join(run.configDir, `${run.slug}.json`), JSON.stringify(config, null, '\t'), {
		mode: 0o600,
	});
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

/** Remove a run's directory config-first (cleanup.ts); returns each path that could not go. */
export function removeRun(run: Run): string[] {
	return removeRunDir(run.dir);
}
