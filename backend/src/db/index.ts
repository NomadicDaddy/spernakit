import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Pool } from 'pg';

import { Database } from 'bun:sqlite';
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import type * as pgSchema from './schema-pg/index.ts';

import { BYTES_PER_MB } from '../constants/files.ts';
import { logger } from '../utils/logger.ts';
import * as schema from './schema/index.ts';

type DatabaseDialect = 'postgres' | 'sqlite';

/**
 * Compile-time assertion: PG and SQLite schemas must export the same set of table names.
 * If a table is added to one schema but not the other, this line produces a type error.
 */
type SchemaParityCheck = [keyof typeof pgSchema] extends [keyof typeof schema]
	? [keyof typeof schema] extends [keyof typeof pgSchema]
		? true
		: never
	: never;
const _schemaParity: SchemaParityCheck = true;

/**
 * Database type used throughout the application.
 *
 * The application uses SQLite schemas as the canonical TypeScript type.
 * When PostgreSQL is selected via config, the runtime creates a PG Drizzle
 * instance that is API-compatible with the SQLite Drizzle instance. The
 * PG schema files in schema-pg/ mirror the SQLite schemas 1:1.
 *
 * To switch a downstream app to PostgreSQL:
 * 1. Set database.dialect to 'postgres' in config
 * 2. Set database.url to a PostgreSQL connection string
 * 3. Update schema imports from './schema/' to './schema-pg/' in service files
 * 4. Run drizzle-kit push/migrate against PostgreSQL
 */
type AppDatabase = BunSQLiteDatabase<typeof schema>;

let db: AppDatabase | null = null;
let sqlite: Database | null = null;
let pgPool: null | Pool = null;
let dbPath: null | string = null;
let currentDialect: DatabaseDialect = 'sqlite';

/**
 * Initialize the database connection.
 *
 * For SQLite (default): pass the absolute file path to the .db file.
 * For PostgreSQL: pass the connection URL (e.g., 'postgresql://user:pass@host:5432/db').
 *
 * @param pathOrUrl - File path (SQLite) or connection URL (PostgreSQL)
 * @param dialect - Database dialect ('sqlite' or 'postgres'), defaults to 'sqlite'
 * @param sslConfig - Optional SSL configuration for PostgreSQL connections
 */
function initializeDatabase(
	pathOrUrl: string,
	dialect: DatabaseDialect = 'sqlite',
	sslConfig?: { enabled?: boolean; rejectUnauthorized?: boolean },
	busyTimeoutMs = 5000
): AppDatabase {
	if (db) {
		throw new Error('Database already initialized. Call closeDatabase() first.');
	}

	currentDialect = dialect;

	if (dialect === 'postgres') {
		// The runtime service layer is written against the SQLite Drizzle API and
		// casting NodePgDatabase to the SQLite type would only produce a false-green
		// startup. The schema-pg/ mirror and SchemaParityCheck above keep schema
		// parity verified at compile time until the port lands.
		throw new Error(
			'postgres dialect requires a service-layer port; not yet supported at runtime. ' +
				"Set database.dialect to 'sqlite' or complete the PostgreSQL port described in db/index.ts."
		);
	}

	// Support :memory: for in-memory SQLite (used in tests)
	const isMemory = pathOrUrl === ':memory:';
	const absolutePath = isMemory ? ':memory:' : resolve(pathOrUrl);
	dbPath = isMemory ? null : absolutePath;
	sqlite = new Database(absolutePath);

	if (!isMemory) {
		// Enable WAL mode for better concurrent access (not supported for in-memory)
		sqlite.exec('PRAGMA journal_mode = WAL');
		// Auto-checkpoint WAL after 1000 pages (~4MB) to prevent unbounded WAL growth
		sqlite.exec('PRAGMA wal_autocheckpoint = 1000');
	}
	sqlite.exec('PRAGMA foreign_keys = ON');
	// Retry on SQLITE_BUSY for configured timeout instead of failing immediately
	sqlite.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

	db = drizzleSqlite(sqlite, { schema });
	return db;
}

/**
 * Get the current database instance.
 * Throws if initializeDatabase() has not been called.
 */
function getDb(): AppDatabase {
	if (!db) {
		throw new Error('Database not initialized. Call initializeDatabase() first.');
	}
	return db;
}

/**
 * Result of a VACUUM operation.
 */
interface VacuumResult {
	/** Number of bytes freed by the VACUUM operation. */
	freedBytes: number;
	/** Database file size in bytes after VACUUM. */
	sizeAfterBytes: number;
	/** Database file size in bytes before VACUUM. */
	sizeBeforeBytes: number;
	/** Whether the VACUUM operation succeeded. */
	success: boolean;
}

/**
 * Run VACUUM on the SQLite database to reclaim space and defragment.
 *
 * VACUUM rebuilds the entire database file, reclaiming free space from
 * deleted records and defragmenting the data. This can improve query
 * performance and reduce disk usage.
 *
 * Note: VACUUM requires exclusive access to the database and may take
 * significant time for large databases. Only applicable to SQLite dialect.
 * For PostgreSQL, VACUUM is managed by the database server automatically.
 *
 * @returns Result object with size metrics and success status
 */
function runVacuum(): VacuumResult {
	if (currentDialect !== 'sqlite') {
		logger.info('VACUUM is managed automatically by PostgreSQL - skipping');
		return { freedBytes: 0, sizeAfterBytes: 0, sizeBeforeBytes: 0, success: true };
	}

	if (!sqlite || !dbPath) {
		logger.error('Cannot run VACUUM: database not initialized');
		return { freedBytes: 0, sizeAfterBytes: 0, sizeBeforeBytes: 0, success: false };
	}

	try {
		// Measure size before VACUUM
		const sizeBeforeBytes = statSync(dbPath).size;

		// Run VACUUM
		sqlite.exec('VACUUM');

		// Measure size after VACUUM
		const sizeAfterBytes = statSync(dbPath).size;
		const freedBytes = Math.max(0, sizeBeforeBytes - sizeAfterBytes);

		logger.info(
			{
				freedBytes,
				freedMB: (freedBytes / BYTES_PER_MB).toFixed(2),
				sizeAfterMB: (sizeAfterBytes / BYTES_PER_MB).toFixed(2),
				sizeBeforeMB: (sizeBeforeBytes / BYTES_PER_MB).toFixed(2),
			},
			'Database VACUUM completed'
		);

		return { freedBytes, sizeAfterBytes, sizeBeforeBytes, success: true };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		logger.error({ error: errorMessage }, 'Database VACUUM failed');
		return { freedBytes: 0, sizeAfterBytes: 0, sizeBeforeBytes: 0, success: false };
	}
}

/**
 * Close the database connection.
 * For SQLite: closes the underlying bun:sqlite Database handle.
 * For PostgreSQL: ends the connection pool.
 */
async function closeDatabase(): Promise<void> {
	if (currentDialect === 'postgres' && pgPool) {
		await pgPool.end();
		pgPool = null;
		logger.info('PostgreSQL connection pool closed');
	} else if (sqlite) {
		sqlite.close();
		sqlite = null;
		logger.info('SQLite database closed');
	}
	db = null;
}

/**
 * Validate the PostgreSQL connection pool by issuing a probe query.
 * Must be called after initializeDatabase() with 'postgres' dialect.
 * Exits the process if the connection cannot be established.
 */
async function validatePgConnection(): Promise<void> {
	if (!pgPool) return;
	try {
		await pgPool.query('SELECT 1');
		logger.info({ dialect: 'postgres' }, 'PostgreSQL database connection validated');
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		logger.error({ error: message }, 'PostgreSQL connection validation failed');
		process.exit(1);
	}
}

/**
 * Create an atomic backup of the SQLite database using VACUUM INTO.
 * Produces a consistent snapshot regardless of WAL state.
 * Only applicable to SQLite dialect.
 *
 * @param targetPath - Absolute path for the backup file
 */
function backupDatabaseTo(targetPath: string): void {
	if (currentDialect !== 'sqlite' || !sqlite) {
		throw new Error('backupDatabaseTo is only supported for SQLite databases');
	}
	if (targetPath.includes('\0')) {
		throw new Error('Backup target path contains null bytes');
	}
	sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	sqlite.prepare('VACUUM INTO ?').run(targetPath);
}

/**
 * Get the current database dialect.
 * Returns 'sqlite' or 'postgres' based on the initialized database.
 */
function getCurrentDialect(): DatabaseDialect {
	return currentDialect;
}

/**
 * Encode a Date for manual sql`` fragments that bypass Drizzle's column encoder.
 *
 * Drizzle's typed insert/update/query builders encode timestamp columns per dialect,
 * but raw SQL parameters are passed directly to the driver.
 *
 * @param date - Date value to bind in a raw SQL fragment.
 * @returns Dialect-compatible timestamp parameter.
 */
function getSqlTimestampParam(date: Date): Date | number {
	if (currentDialect === 'sqlite') return Math.floor(date.getTime() / 1000);

	return date;
}

export {
	backupDatabaseTo,
	closeDatabase,
	getCurrentDialect,
	getDb,
	getSqlTimestampParam,
	initializeDatabase,
	runVacuum,
	validatePgConnection,
};
