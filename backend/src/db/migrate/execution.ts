import { type Database } from 'bun:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { JournalEntry } from './journal.ts';

import { logger } from '../../utils/logger.ts';
import { createPreMigrationBackup, restoreFromBackup } from './backup.ts';
import { computeContentHash, computeTagHash } from './discovery.ts';
import { rewriteSqlForIdempotency } from './idempotency.ts';
import { validateDatabaseIntegrity } from './validate.ts';

function assertPreMigrationIntegrity(db: Database): void {
	const preErrors = validateDatabaseIntegrity(db);
	if (preErrors.length === 0) return;
	for (const error of preErrors) {
		logger.error({ error }, 'Pre-migration validation failed');
	}
	throw new Error(
		`Pre-migration database validation failed. Manual intervention required. ` +
			`Errors: ${preErrors.join('; ')}`
	);
}

function tryCreatePreMigrationBackup(db: Database, dbPath: string): string | undefined {
	try {
		const backupPath = createPreMigrationBackup(db, dbPath);
		logger.info(`Pre-migration backup created: ${backupPath}`);
		return backupPath;
	} catch (err) {
		logger.warn({ err }, 'Failed to create pre-migration backup — proceeding without backup');
		return undefined;
	}
}

function assertPostMigrationIntegrity(
	db: Database,
	dbPath: string,
	backupPath: string | undefined
): void {
	const postErrors = validateDatabaseIntegrity(db);
	if (postErrors.length === 0) return;
	for (const error of postErrors) {
		logger.error({ error }, 'Post-migration validation failed');
	}
	if (!backupPath) return;

	logger.error(
		'Post-migration validation failed — attempting to restore from pre-migration backup'
	);
	db.close();
	try {
		restoreFromBackup(dbPath, backupPath);
		logger.error('Database restored from pre-migration backup. Manual migration required.');
	} catch (err) {
		logger.error(
			{ err },
			'Failed to restore from backup — database may be in inconsistent state'
		);
	}
	throw new Error(
		'Post-migration validation failed. Database restored from backup. Manual intervention required.'
	);
}

/**
 * Disable foreign keys before migrations containing the Drizzle table-rebuild
 * pattern. SQLite ignores PRAGMA foreign_keys inside a transaction, so the
 * toggle must happen before BEGIN. Returns true if they were disabled.
 * Mirrors scripts/lib/migrate/statements.ts (prepareForeignKeys).
 */
function prepareForeignKeys(db: Database, statements: string[]): boolean {
	const hasFkOff = statements.some((s) => /^PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(s));
	if (hasFkOff) {
		db.exec('PRAGMA foreign_keys = OFF');
	}
	return hasFkOff;
}

/** Re-enable foreign keys after a migration that disabled them. No-op otherwise. */
function restoreForeignKeys(db: Database, wereDisabled: boolean): void {
	if (wereDisabled) {
		db.exec('PRAGMA foreign_keys = ON');
	}
}

/** Throw if PRAGMA foreign_key_check reports violations after a table rebuild. */
function assertForeignKeyIntegrity(db: Database, tag: string): void {
	const violations = db.query('PRAGMA foreign_key_check').all();
	if (violations.length > 0) {
		throw new Error(
			`Foreign key check failed after migration ${tag}: ${violations.length} violation(s)`
		);
	}
}

function applyMigrationEntry(db: Database, entry: JournalEntry, migrationsDir: string): void {
	const sqlPath = join(migrationsDir, `${entry.tag}.sql`);
	if (!existsSync(sqlPath)) {
		throw new Error(`Migration file not found: ${sqlPath}`);
	}

	const sql = readFileSync(sqlPath, 'utf8');
	const statements = sql
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	// FK toggle must happen outside the transaction (no-op inside one in SQLite)
	const fkWereDisabled = prepareForeignKeys(db, statements);
	let skippedCount = 0;

	db.exec('BEGIN');
	try {
		for (const statement of statements) {
			// PRAGMA foreign_keys is handled out-of-transaction above
			if (/^PRAGMA\s+foreign_keys/i.test(statement)) continue;
			try {
				db.exec(rewriteSqlForIdempotency(statement));
			} catch (err) {
				if (isBenignDdlError(err, entry.tag, statement)) {
					skippedCount++;
					continue;
				}
				throw err;
			}
		}

		// Verify FK integrity before COMMIT so a rebuild that broke references rolls back
		if (fkWereDisabled) {
			assertForeignKeyIntegrity(db, entry.tag);
		}

		// Record (hash, content_hash) only after every statement succeeded or was
		// benignly skipped — a non-benign failure throws before this insert.
		db.query(
			'INSERT INTO __drizzle_migrations (hash, created_at, content_hash) VALUES (?, ?, ?)'
		).run(computeTagHash(entry.tag), Date.now(), computeContentHash(sql));

		db.exec('COMMIT');
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	} finally {
		restoreForeignKeys(db, fkWereDisabled);
	}

	if (skippedCount > 0) {
		logger.warn(
			{ skippedCount, tag: entry.tag },
			`MIGRATION ${entry.tag} applied with ${skippedCount} statement(s) skipped as benign DDL ` +
				`errors — verify the schema matches expectations`
		);
	}
	logger.info(`  Applied migration: ${entry.tag}`);
}

function isBenignDdlError(err: unknown, tag: string, statement: string): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	const isBenign =
		msg.includes('duplicate column name') ||
		(msg.includes('already exists') &&
			(msg.includes('table') || msg.includes('index') || msg.includes('view')));

	if (isBenign) {
		logger.warn(
			{ statement: statement.substring(0, 200) },
			`Benign DDL error in migration ${tag}, statement skipped: ${err.message}`
		);
	}

	return isBenign;
}

export {
	applyMigrationEntry,
	assertPostMigrationIntegrity,
	assertPreMigrationIntegrity,
	tryCreatePreMigrationBackup,
};
