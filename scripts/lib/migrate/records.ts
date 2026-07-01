/**
 * Access to the __drizzle_migrations tracking table.
 */
import type { Database } from 'bun:sqlite';

import type { MigrationRecord } from './types.ts';

import { computeHash } from './journal.ts';

/**
 * Ensure the migrations table exists.
 */
function ensureMigrationsTable(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hash TEXT NOT NULL,
			created_at INTEGER
		)
	`);
}

/**
 * Get applied migrations from database.
 */
export function getAppliedMigrations(db: Database): MigrationRecord[] {
	ensureMigrationsTable(db);
	const stmt = db.query<MigrationRecord, []>(
		'SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id'
	);
	return stmt.all();
}

/**
 * Mark a migration as applied.
 */
export function markMigrationApplied(db: Database, tag: string): void {
	const hash = computeHash(tag);
	const createdAt = Date.now();
	db.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
		hash,
		createdAt
	);
}
