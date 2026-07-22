/**
 * Migration application: running pending migrations, baselining existing
 * databases, and per-migration performance tracking.
 */
import { Database } from 'bun:sqlite';

import type { JournalEntry, Paths, PerformanceMetrics } from './types.ts';

import { recordMigrationFailure, recordMigrationSuccess } from './history.ts';
import { computeContentHash, computeHash, readJournal, readMigrationSql } from './journal.ts';
import { getAppliedMigrations, markMigrationApplied } from './records.ts';
import {
	assertPostMigrationIntegrity,
	executeStatements,
	prepareForeignKeys,
	restoreForeignKeys,
	splitStatements,
} from './statements.ts';
import { validatePreMigration } from './validate.ts';

/**
 * Format duration in human-readable format.
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms.toFixed(0)}ms`;
	} else if (ms < 60000) {
		return `${(ms / 1000).toFixed(2)}s`;
	} else {
		const minutes = Math.floor(ms / 60000);
		const seconds = ((ms % 60000) / 1000).toFixed(0);
		return `${minutes}m ${seconds}s`;
	}
}

/**
 * Apply a single migration inside a transaction.
 * If any statement fails, the entire migration is rolled back so the
 * database never ends up in a partially-applied state.
 */
function applyMigration(
	db: Database,
	migrationsDir: string,
	entry: JournalEntry
): PerformanceMetrics {
	const sql = readMigrationSql(migrationsDir, entry.tag);
	const contentHash = computeContentHash(sql);
	const statements = splitStatements(sql);

	console.log(`  Applying: ${entry.tag}`);
	console.log(`    Statements: ${statements.length}`);

	const startTime = performance.now();
	let statementCount = 0;
	const fkWereDisabled = prepareForeignKeys(db, statements);

	db.exec('BEGIN');
	try {
		statementCount = executeStatements(db, statements);
		markMigrationApplied(db, entry.tag);
		db.exec('COMMIT');
		restoreForeignKeys(db, fkWereDisabled);
		assertPostMigrationIntegrity(db, entry.tag);

		const durationMs = performance.now() - startTime;
		console.log(`    ✓ Applied in ${formatDuration(durationMs)}`);
		if (durationMs > 5000) {
			console.log(
				`    ⚠ Migration took longer than 5s - consider reviewing for optimization`
			);
		}
		recordMigrationSuccess({
			contentHash,
			durationMs,
			migrationTag: entry.tag,
			statementCount,
		});
		return { durationMs, statementCount };
	} catch (err) {
		recordMigrationFailure({
			durationMs: performance.now() - startTime,
			error: err,
			migrationTag: entry.tag,
			statementCount,
		});
		db.exec('ROLLBACK');
		restoreForeignKeys(db, fkWereDisabled);
		throw err;
	}
}

/**
 * Run pending migrations.
 */
export function runMigrations(paths: Paths): void {
	const journal = readJournal(paths.journalPath);
	const db = new Database(paths.database);

	try {
		// Enable WAL mode for better concurrent access during migrations
		db.exec('PRAGMA journal_mode = WAL');
		// Flush any pending WAL data before migration to ensure consistent state
		db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		// Enable foreign keys
		db.exec('PRAGMA foreign_keys = ON');

		// Pre-migration validation
		console.log('Validating database state...');
		const validation = validatePreMigration(db);
		if (!validation.valid) {
			console.error('\n❌ Pre-migration validation failed:');
			for (const issue of validation.issues) {
				console.error(`  - ${issue}`);
			}
			console.error('\nFix the above issues before running migrations.');
			console.error('Run with --validate to check without applying migrations.');
			process.exit(1);
		}
		console.log('✓ Validation passed\n');

		const applied = getAppliedMigrations(db);
		const appliedHashes = new Set(applied.map((m) => m.hash));

		const pending = journal.entries.filter((entry) => {
			const hash = computeHash(entry.tag);
			return !appliedHashes.has(hash);
		});

		if (pending.length === 0) {
			console.log('✓ No pending migrations');
			return;
		}

		console.log(`Found ${pending.length} pending migration(s):\n`);

		// Create pre-migration backup using VACUUM INTO for consistency.
		// This is critical because SQLite DDL statements auto-commit, making
		// transaction-based rollback unreliable for schema migrations.
		const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupPath = `${paths.database}.pre-migrate-${backupTimestamp}.bak`;
		try {
			db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
			console.log(`✓ Pre-migration backup: ${backupPath}\n`);
		} catch (err) {
			throw new Error(
				`Pre-migration backup failed: ${err instanceof Error ? err.message : String(err)}`,
				{ cause: err }
			);
		}

		// Track overall performance
		const overallStartTime = performance.now();
		const performanceResults: PerformanceMetrics[] = [];

		for (const entry of pending) {
			const metrics = applyMigration(db, paths.migrationsDir, entry);
			performanceResults.push(metrics);
		}

		const overallDuration = performance.now() - overallStartTime;

		// Performance summary
		console.log(
			`\n✓ Applied ${pending.length} migration(s) in ${formatDuration(overallDuration)}`
		);

		// Log performance summary for multi-migration runs
		if (pending.length > 1) {
			const totalStatements = performanceResults.reduce(
				(sum, m) => sum + m.statementCount,
				0
			);
			const avgDuration =
				performanceResults.reduce((sum, m) => sum + m.durationMs, 0) /
				performanceResults.length;

			console.log('\nPerformance Summary:');
			console.log(`  Total statements: ${totalStatements}`);
			console.log(`  Average migration time: ${formatDuration(avgDuration)}`);
		}

		// Performance warning for slow migrations
		const slowMigrations = performanceResults.filter((m) => m.durationMs > 10000);
		if (slowMigrations.length > 0) {
			console.log(
				`\n⚠ ${slowMigrations.length} migration(s) took more than 10s - consider reviewing schema changes`
			);
		}
	} finally {
		db.close();
	}
}

/**
 * Mark initial migration as applied without running it.
 * Use this for existing databases that were created with db:push.
 */
export function baselineMigration(paths: Paths): void {
	const journal = readJournal(paths.journalPath);
	const db = new Database(paths.database);

	try {
		const applied = getAppliedMigrations(db);
		const appliedHashes = new Set(applied.map((m) => m.hash));

		// Find migrations that haven't been applied
		const pending = journal.entries.filter((entry) => {
			const hash = computeHash(entry.tag);
			return !appliedHashes.has(hash);
		});

		if (pending.length === 0) {
			console.log('✓ All migrations already marked as applied');
			return;
		}

		console.log(`Marking ${pending.length} migration(s) as applied (baseline):\n`);

		for (const entry of pending) {
			console.log(`  Baseline: ${entry.tag}`);
			markMigrationApplied(db, entry.tag);
			console.log(`    ✓ Marked as applied`);
		}

		console.log(`\n✓ Baseline complete. ${pending.length} migration(s) marked as applied.`);
		console.log(
			'\nNote: No SQL was executed. The database schema is assumed to match the migration files.'
		);
	} finally {
		db.close();
	}
}
