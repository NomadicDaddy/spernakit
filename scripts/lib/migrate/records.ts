/**
 * Access to the __drizzle_migrations tracking table.
 */
import type { Database } from 'bun:sqlite';

import type { MigrationRecord } from './types.ts';

import { computeHash } from './journal.ts';

/**
 * Ensure the migrations table exists, with the nullable content_hash column the startup runner
 * also writes (backend/src/db/migrate/discovery.ts openMigrationDatabase). A journal created
 * before the column existed gains it through an additive ALTER. Its older rows keep a null
 * content_hash, which every reader tolerates.
 */
function ensureMigrationsTable(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hash TEXT NOT NULL,
			created_at INTEGER
		)
	`);
	const columns = db.query<{ name: string }, []>('PRAGMA table_info(__drizzle_migrations)').all();
	if (!columns.some((c) => c.name === 'content_hash')) {
		db.exec('ALTER TABLE __drizzle_migrations ADD COLUMN content_hash TEXT');
	}
}

/**
 * Get applied migrations from database.
 */
export function getAppliedMigrations(db: Database): MigrationRecord[] {
	ensureMigrationsTable(db);
	const stmt = db.query<MigrationRecord, []>(
		'SELECT id, hash, created_at, content_hash FROM __drizzle_migrations ORDER BY id',
	);
	return stmt.all();
}

/**
 * Mark a migration as applied, recording the hash of the SQL it was applied from.
 */
export function markMigrationApplied(db: Database, tag: string, contentHash: string): void {
	const hash = computeHash(tag);
	const createdAt = Date.now();
	db.query(
		'INSERT INTO __drizzle_migrations (hash, created_at, content_hash) VALUES (?, ?, ?)',
	).run(hash, createdAt, contentHash);
}
