/**
 * Status reporting and CLI help text for the database migration script.
 */
import { Database } from 'bun:sqlite';

import type { Paths } from './types.ts';

import { computeHash, readJournal } from './journal.ts';
import { getAppliedMigrations } from './records.ts';

/**
 * Show migration status.
 */
export function showStatus(paths: Paths): void {
	const journal = readJournal(paths.journalPath);
	const db = new Database(paths.database);

	try {
		const applied = getAppliedMigrations(db);
		const appliedHashes = new Set(applied.map((m) => m.hash));

		console.log('Migration Status:\n');
		console.log(`Database: ${paths.database}`);
		console.log(`Migrations: ${paths.migrationsDir}\n`);

		if (journal.entries.length === 0) {
			console.log('No migrations found.');
			return;
		}

		let pendingCount = 0;

		for (const entry of journal.entries) {
			const hash = computeHash(entry.tag);
			const isApplied = appliedHashes.has(hash);
			const status = isApplied ? '✓' : '○';
			const statusText = isApplied ? 'applied' : 'pending';

			console.log(`  ${status} ${entry.tag} (${statusText})`);

			if (!isApplied) {
				pendingCount++;
			}
		}

		console.log('');
		if (pendingCount > 0) {
			console.log(`${pendingCount} pending migration(s)`);
			console.log("\nRun 'bun run db:migrate' to apply pending migrations.");
		} else {
			console.log('All migrations applied.');
		}
	} finally {
		db.close();
	}
}

/**
 * Print help message.
 */
export function printHelp(): void {
	console.log(`
Database Migration Script for Spernakit v3

Usage:
  bun run db:migrate [options]

Options:
  --status     Show migration status without applying changes
  --baseline   Mark all migrations as applied without executing SQL
               Use this for existing databases created with db:push
  --validate   Run pre-migration validation without applying migrations
  --rollback   Show rollback status (applied migrations with rollback files)
  --rollback <tag> --force  Execute a specific rollback
  --help       Show this help message

Examples:
  bun run db:migrate            Apply pending migrations
  bun run db:migrate --status   Show which migrations are applied/pending
  bun run db:migrate --baseline Mark existing migrations as applied
  bun run db:migrate --validate Check database state before migrating
  bun run db:migrate --rollback Show rollback status
  bun run db:migrate --rollback 20260210_xxx --force  Execute a rollback

Rollback Safety:
  ⚠️  Rollbacks are DESTRUCTIVE operations that can result in DATA LOSS.
  ⚠️  Always backup your database before executing a rollback.
  ⚠️  Rollbacks require --force flag to prevent accidental execution.

Migration Workflow:
  1. Modify schema files in backend/src/db/schema/
  2. Run 'bun run db:generate' to create migration SQL
  3. Review generated SQL in backend/drizzle/
  4. Run 'bun run db:migrate --validate' to check database state
  5. Run 'bun run db:migrate' to apply migrations
  6. Commit migration files to version control

Best Practices:
  - Never use db:push in production
  - Always generate migrations after schema changes
  - Test migrations in staging before production
  - Back up database before migrating
  - Review generated SQL before committing
  - Run --validate before migrations in production

Safety Guidelines:
  - Never add NOT NULL columns without defaults to non-empty tables
  - See backend/drizzle/MIGRATION_SAFETY.md for detailed safety checklist
  - See backend/drizzle/ROLLBACK.md for rollback procedures
`);
}
