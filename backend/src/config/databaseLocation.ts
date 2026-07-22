import { isAbsolute, relative, resolve } from 'node:path';

/**
 * ASSERT-010 guard — Database files MUST reside only under `data/` at the
 * project root; they MUST NOT be created under `backend/data/` or any other
 * location.
 *
 * This module provides a pure resolver and containment assertion shared by the
 * startup config guard (`app.ts`) and the `check:db-location` CI gate, so a
 * misconfigured `database.url`/path fails before creating a database file.
 */

/** Stable invariant id surfaced in failure messages. */
const ASSERT_010 = 'ASSERT-010';

/** Minimal shape of the `database` config section consumed by the guard. */
interface DatabaseLocationConfig {
	dialect: string;
	url: string;
}

interface DbLocationCheckResult {
	/** Human-readable failure reason (only set when `ok` is false). */
	message?: string;
	/** True when the resolved DB file path is under `data/` (or no local file applies). */
	ok: boolean;
	/**
	 * Absolute local DB file path that was checked, or null when no app-managed
	 * local file applies (in-memory SQLite or a remote PostgreSQL connection).
	 */
	resolvedPath: null | string;
}

/** Strip a `file:` URI prefix and a leading `./` so the remainder is a path. */
function stripFilePrefix(url: string): string {
	const withoutScheme = url.startsWith('file:') ? url.slice('file:'.length) : url;
	return withoutScheme.startsWith('./') ? withoutScheme.slice(2) : withoutScheme;
}

/** True when `candidate` looks like a filesystem path rather than a network URL. */
function looksLikeFilesystemPath(candidate: string): boolean {
	return isAbsolute(candidate) || candidate.startsWith('./') || candidate.startsWith('../');
}

/**
 * Resolve the local filesystem path a PostgreSQL config would use, if any.
 *
 * Remote connections (`postgresql://host:5432/db`) manage their data on the
 * server and have no app-managed local file → returns null. Local-socket or
 * path-style configs (`file:` prefix, a bare filesystem path, or a unix-socket
 * directory passed via `?host=/path`) do resolve to a local path and are
 * subject to the data/ containment rule.
 */
function resolvePostgresLocalPath(url: string, projectRoot: string): null | string {
	if (url.startsWith('file:') || looksLikeFilesystemPath(url)) {
		return resolve(projectRoot, stripFilePrefix(url));
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	// Unix-socket connections specify the socket directory via ?host=/path.
	const hostParam = parsed.searchParams.get('host');
	if (hostParam && looksLikeFilesystemPath(hostParam)) {
		return resolve(projectRoot, hostParam);
	}
	return null;
}

/**
 * Resolve the absolute local DB file path implied by a database config, or null
 * when no app-managed local file applies (in-memory SQLite / remote Postgres).
 */
function resolveLocalDbPath(database: DatabaseLocationConfig, projectRoot: string): null | string {
	const { dialect, url } = database;
	if (dialect === 'sqlite') {
		if (url === ':memory:' || url === '') return null;
		return resolve(projectRoot, stripFilePrefix(url));
	}
	// Any non-sqlite dialect is treated as PostgreSQL for location purposes.
	return resolvePostgresLocalPath(url, projectRoot);
}

/** True when `absolutePath` is a file strictly inside `projectRoot/data/`. */
function isDbPathUnderDataDir(absolutePath: string, projectRoot: string): boolean {
	const dataDir = resolve(projectRoot, 'data');
	const rel = relative(dataDir, absolutePath);
	return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Assert that the database config's resolved local file path (if any) lives
 * under `projectRoot/data/`. Configs with no local file (in-memory / remote
 * Postgres) pass unconditionally.
 */
function assertDbUnderDataDir(
	database: DatabaseLocationConfig,
	projectRoot: string
): DbLocationCheckResult {
	const resolvedPath = resolveLocalDbPath(database, projectRoot);
	if (resolvedPath === null) {
		return { ok: true, resolvedPath: null };
	}

	if (isDbPathUnderDataDir(resolvedPath, projectRoot)) {
		return { ok: true, resolvedPath };
	}

	const dataDir = resolve(projectRoot, 'data');
	return {
		message:
			`${ASSERT_010} violation: database "${database.dialect}" path resolves to ` +
			`"${resolvedPath}", which is not under the project-root data/ directory ("${dataDir}"). ` +
			'Database files MUST reside only under data/ (never backend/data/ or elsewhere). ' +
			'Fix database.url in your config to point under ./data/.',
		ok: false,
		resolvedPath,
	};
}

export {
	ASSERT_010,
	assertDbUnderDataDir,
	type DatabaseLocationConfig,
	type DbLocationCheckResult,
	isDbPathUnderDataDir,
	resolveLocalDbPath,
};
