/**
 * Shared types for the database migration script (scripts/migrate.ts).
 */

/** Journal entry from drizzle's meta/_journal.json */
export interface JournalEntry {
	breakpoints: boolean;
	idx: number;
	tag: string;
	version: string;
	when: number;
}

/** Drizzle journal file format */
export interface DrizzleJournal {
	dialect: string;
	entries: JournalEntry[];
	version: string;
}

/** Migration record from database */
export interface MigrationRecord {
	created_at: number;
	hash: string;
	id: number;
}

/** Result of pre-migration validation */
export interface ValidationResult {
	issues: string[];
	valid: boolean;
}

/** Performance metrics for a migration */
export interface PerformanceMetrics {
	durationMs: number;
	statementCount: number;
}

/** Migration history entry persisted to data/migration-history.json */
export interface MigrationHistoryEntry {
	contentHash?: string;
	durationMs: number;
	error?: string;
	migrationTag: string;
	statementCount: number;
	status: 'failed' | 'success';
	timestamp: string;
}

/** Paths configuration */
export interface Paths {
	database: string;
	journalPath: string;
	migrationsDir: string;
	rollbacksDir: string;
}
