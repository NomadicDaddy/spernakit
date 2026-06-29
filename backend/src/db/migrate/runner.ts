import { join } from 'node:path';

import { logger } from '../../utils/logger.ts';
import { removePreMigrationBackup } from './backup.ts';
import {
	assertNoMigrationDrift,
	openMigrationDatabase,
	selectPendingMigrations,
} from './discovery.ts';
import {
	applyMigrationEntry,
	assertPostMigrationIntegrity,
	assertPreMigrationIntegrity,
	tryCreatePreMigrationBackup,
} from './execution.ts';
import { readJournal } from './journal.ts';
import { getSchemaVersion } from './schemaVersion.ts';

/**
 * Auto-run pending Drizzle migrations on startup (SQLite only).
 *
 * Opens a separate SQLite connection to apply migrations, then closes it.
 * The main Drizzle ORM connection (already initialized) picks up the schema changes.
 *
 * This handles:
 * - Fresh installs: database file exists but has no tables
 * - Upgrades: database has some migrations applied, new ones are pending
 * - No-op: all migrations already applied
 *
 * Safety features:
 * - Pre-migration backup in data/ directory
 * - Integrity check before and after migration
 * - Automatic restore from backup if post-migration validation fails
 *
 * PostgreSQL note: This module only supports SQLite. PostgreSQL deployments must
 * run migrations manually via `drizzle-kit push` or `drizzle-kit migrate` before
 * starting the application. See DEPLOYMENT.md for PostgreSQL migration procedure.
 */
function runAutoMigrations(dbPath: string, migrationsDir: string): void {
	const journalPath = join(migrationsDir, 'meta', '_journal.json');
	const journal = readJournal(journalPath);
	if (!journal || journal.entries.length === 0) {
		return;
	}

	assertNoMigrationDrift(migrationsDir, journal);

	const db = openMigrationDatabase(dbPath);
	try {
		const pending = selectPendingMigrations(db, journal.entries, migrationsDir);
		if (pending.length === 0) {
			return;
		}

		logger.info(`Applying ${pending.length} pending migration(s) on startup...`);

		assertPreMigrationIntegrity(db);
		const backupPath = tryCreatePreMigrationBackup(db, dbPath);

		for (const entry of pending) {
			applyMigrationEntry(db, entry, migrationsDir);
		}

		assertPostMigrationIntegrity(db, dbPath, backupPath);

		logger.info(
			`All ${pending.length} migration(s) applied successfully (schema version: ${pending[pending.length - 1]?.tag ?? 'unknown'})`
		);

		if (backupPath) {
			removePreMigrationBackup(backupPath);
		}
	} finally {
		try {
			db.close();
		} catch {
			// Already closed during restore
		}
	}
}

export { getSchemaVersion, runAutoMigrations };
