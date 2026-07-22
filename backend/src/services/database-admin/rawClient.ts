import type { Database as DatabaseType } from 'bun:sqlite';

import { Database } from 'bun:sqlite';

import { getCurrentDialect, getDb } from '../../db/index.ts';

class PostgreSqlNotSupportedError extends Error {
	constructor(message = 'Database admin panel is not supported with PostgreSQL dialect') {
		super(message);
		this.name = 'PostgreSqlNotSupportedError';
	}
}

/**
 * Access the raw SQLite client from the Drizzle ORM instance.
 * Uses getDb() (as required by project conventions) and extracts $client.
 *
 * Drizzle exposes the underlying bun:sqlite Database via the $client property.
 * @returns The underlying bun:sqlite Database instance.
 * @throws PostgreSqlNotSupportedError if the database dialect is PostgreSQL (not supported)
 */
function getRawClient(): DatabaseType {
	const dialect = getCurrentDialect();
	if (dialect === 'postgres') {
		throw new PostgreSqlNotSupportedError();
	}

	const db = getDb();
	// Drizzle's drizzle() return type includes $client but BunSQLiteDatabase's public
	// type does not expose it. Intersection assertion avoids the double-cast pattern.
	const rawDb = (db as typeof db & { $client: DatabaseType }).$client;
	if (!rawDb || typeof rawDb.query !== 'function') {
		throw new Error(
			'Failed to access raw SQLite client - Drizzle ORM internal API may have changed'
		);
	}
	return rawDb;
}

/** Dedicated read-only SQLite connection for SQL sandbox queries. */
let readOnlyClient: DatabaseType | null = null;

/**
 * Get a dedicated read-only SQLite connection for sandbox queries.
 *
 * Opens a separate connection to the same database file with PRAGMA query_only = ON
 * permanently set. This avoids toggling the PRAGMA on the shared application connection,
 * eliminating the race condition where concurrent requests could be affected.
 *
 * @returns A read-only Database instance.
 * @throws Error if the database dialect is PostgreSQL or the DB path cannot be resolved.
 */
function getReadOnlyClient(): DatabaseType {
	if (readOnlyClient) return readOnlyClient;

	const rawDb = getRawClient();
	const filename = rawDb.filename;
	if (!filename) {
		throw new Error('Cannot create read-only client for in-memory database');
	}

	readOnlyClient = new Database(filename, { readonly: true });
	readOnlyClient.exec('PRAGMA query_only = ON');
	return readOnlyClient;
}

/**
 * Close the dedicated read-only client if open.
 * Called during database shutdown to clean up resources.
 */
function closeReadOnlyClient(): void {
	if (readOnlyClient) {
		readOnlyClient.close();
		readOnlyClient = null;
	}
}

export { closeReadOnlyClient, getRawClient, getReadOnlyClient, PostgreSqlNotSupportedError };
