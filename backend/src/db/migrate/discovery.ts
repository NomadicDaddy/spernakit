import { Database } from 'bun:sqlite';
import crypto from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DrizzleJournal, JournalEntry } from './journal.ts';

import { logger } from '../../utils/logger.ts';

/**
 * Hash a migration tag for the __drizzle_migrations.hash column.
 * Matches the CLI runner (scripts/lib/migrate/journal.ts computeHash).
 */
function computeTagHash(tag: string): string {
	return crypto.createHash('sha256').update(tag).digest('hex');
}

/**
 * Hash migration SQL content for tamper detection.
 * Matches the CLI runner (scripts/lib/migrate/journal.ts computeContentHash).
 */
function computeContentHash(sql: string): string {
	return crypto.createHash('sha256').update(sql).digest('hex');
}

function assertNoMigrationDrift(migrationsDir: string, journal: DrizzleJournal): void {
	if (!existsSync(migrationsDir)) return;
	const journaledTags = new Set(journal.entries.map((e) => e.tag));
	const sqlFiles = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.map((f) => f.replace(/\.sql$/, ''));
	const orphaned = sqlFiles.filter((tag) => !journaledTags.has(tag));
	if (orphaned.length === 0) return;
	logger.error(
		{ orphaned },
		`Migration drift detected: ${orphaned.length} .sql file(s) exist on disk ` +
			`but are not registered in _journal.json. Either delete the orphaned ` +
			`files or add them to _journal.json. Runner refuses to proceed.`
	);
	throw new Error(
		`Migration drift: orphaned .sql file(s) not in journal: ${orphaned.join(', ')}`
	);
}

function openMigrationDatabase(dbPath: string): Database {
	const db = new Database(dbPath);
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hash TEXT NOT NULL,
			created_at INTEGER
		)
	`);
	// Nullable side column for content-hash tamper detection. Compatible with the
	// CLI runner and drizzle-kit, which only read/write (hash, created_at).
	const columns = db.query<{ name: string }, []>('PRAGMA table_info(__drizzle_migrations)').all();
	if (!columns.some((c) => c.name === 'content_hash')) {
		db.exec('ALTER TABLE __drizzle_migrations ADD COLUMN content_hash TEXT');
	}
	return db;
}

/**
 * Warn (prominently) when a previously applied migration file's content no
 * longer matches the content hash recorded at apply time. Never auto-reruns.
 */
function warnOnContentHashMismatch(
	entry: JournalEntry,
	recordedContentHash: string,
	migrationsDir: string
): void {
	const sqlPath = join(migrationsDir, `${entry.tag}.sql`);
	if (!existsSync(sqlPath)) return;
	const currentContentHash = computeContentHash(readFileSync(sqlPath, 'utf8'));
	if (currentContentHash === recordedContentHash) return;
	logger.warn(
		{ currentContentHash, recordedContentHash, tag: entry.tag },
		`MIGRATION CONTENT MISMATCH: ${entry.tag}.sql differs from the content recorded when it was applied. ` +
			`The migration will NOT be re-run. Verify the schema matches expectations.`
	);
}

function selectPendingMigrations(
	db: Database,
	entries: JournalEntry[],
	migrationsDir: string
): JournalEntry[] {
	const applied = db
		.query<{ content_hash: null | string; hash: string }, []>(
			'SELECT hash, content_hash FROM __drizzle_migrations'
		)
		.all();
	const entryByTagHash = new Map(entries.map((e) => [computeTagHash(e.tag), e]));

	const appliedTagHashes = new Set<string>();
	const unknownHashes: string[] = [];
	for (const record of applied) {
		const entry = entryByTagHash.get(record.hash);
		if (!entry) {
			unknownHashes.push(record.hash);
			continue;
		}
		appliedTagHashes.add(record.hash);
		if (record.content_hash) {
			warnOnContentHashMismatch(entry, record.content_hash, migrationsDir);
		}
	}

	if (unknownHashes.length > 0) {
		throw new Error(
			`__drizzle_migrations contains ${unknownHashes.length} record(s) whose hash matches no ` +
				`journal tag. They were likely written by another tool (e.g. drizzle-kit migrate, ` +
				`which hashes file contents) or the journal was modified. Refusing to proceed — ` +
				`reconcile the migration journal manually instead of treating the database as unmigrated.`
		);
	}

	return entries.filter((entry) => !appliedTagHashes.has(computeTagHash(entry.tag)));
}

function resolveJournalPathFromDb(dbPath: string): string | undefined {
	const dataDir = join(dbPath, '..');
	const projectRoot = join(dataDir, '..');
	const journalPath = join(projectRoot, 'backend', 'drizzle', 'meta', '_journal.json');
	return existsSync(journalPath) ? journalPath : undefined;
}

export {
	assertNoMigrationDrift,
	computeContentHash,
	computeTagHash,
	openMigrationDatabase,
	resolveJournalPathFromDb,
	selectPendingMigrations,
};
