#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
/**
 * Database Migration Script for Spernakit v3
 *
 * Manages Drizzle Kit migrations with support for:
 * - Running pending migrations
 * - Baseline marking for existing databases
 * - Migration status reporting
 * - Pre-migration validation
 * - Rollback support
 * - Performance metrics
 *
 * Usage:
 *   bun run db:migrate           - Run pending migrations
 *   bun run db:migrate --status  - Show migration status
 *   bun run db:migrate --baseline - Mark initial migration as applied (for existing dbs)
 *   bun run db:migrate --validate - Check database state before migrating
 *   bun run db:migrate --rollback - Show rollback status
 *
 * IMPORTANT:
 *   - Never use db:push in production
 *   - Always generate migrations after schema changes
 *   - Test migrations in staging before production
 *   - Back up database before migrating
 */
import fs from 'node:fs';

import { baselineMigration, runMigrations } from './lib/migrate/apply.ts';
import { getConfiguredDialect, getPaths, repoRoot } from './lib/migrate/paths.ts';
import { printHelp, showStatus } from './lib/migrate/reporting.ts';
import { executeRollback, showRollbackStatus } from './lib/migrate/rollback.ts';
import { validateOnly } from './lib/migrate/validate.ts';
import { loadJsonConfig } from './load-json-config.js';

/**
 * Main entry point.
 */
function main(): void {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printHelp();
		process.exit(0);
	}

	const { appSlug } = loadJsonConfig(repoRoot);

	// Check dialect — this migration script only supports SQLite
	const dialect = getConfiguredDialect(appSlug);
	if (dialect === 'postgres') {
		console.error('This migration script is for SQLite only.');
		console.error("For PostgreSQL, use 'bunx drizzle-kit migrate' or 'bunx drizzle-kit push'.");
		console.error(
			'Drizzle Kit reads the dialect from backend/drizzle.config.ts automatically.'
		);
		process.exit(1);
	}

	const paths = getPaths(appSlug);

	// Log fresh install if database does not exist yet
	if (!fs.existsSync(paths.database)) {
		console.log(`Database not found at ${paths.database} — creating fresh database.`);
	}

	// Verify migrations directory exists
	if (!fs.existsSync(paths.migrationsDir)) {
		console.error(`Migrations directory not found: ${paths.migrationsDir}`);
		console.error("Run 'bun run db:generate' to create the initial migration first.");
		process.exit(1);
	}

	try {
		if (args.includes('--status')) {
			showStatus(paths);
		} else if (args.includes('--baseline')) {
			baselineMigration(paths);
		} else if (args.includes('--validate')) {
			validateOnly(paths);
		} else if (args.includes('--rollback')) {
			const rollbackIndex = args.indexOf('--rollback');
			const nextArg = args[rollbackIndex + 1];
			const force = args.includes('--force');

			if (nextArg && !nextArg.startsWith('--')) {
				const db = new Database(paths.database);
				try {
					db.exec('PRAGMA foreign_keys = ON');
					executeRollback(db, paths.rollbacksDir, nextArg, force);
				} finally {
					db.close();
				}
			} else {
				showRollbackStatus(paths);
			}
		} else {
			runMigrations(paths);
		}
	} catch (err) {
		console.error('\n❌ Migration failed:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

main();
