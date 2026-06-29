/**
 * Rollback support: reading rollback SQL files, executing rollbacks, and
 * reporting rollback availability.
 */
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import type { Paths } from './types.ts';

import { computeHash, readJournal } from './journal.ts';
import { getAppliedMigrations } from './records.ts';
import { splitStatements } from './statements.ts';

/**
 * Read a rollback SQL file.
 */
function readRollbackSql(rollbacksDir: string, tag: string): null | string {
	const sqlPath = path.join(rollbacksDir, `${tag}.rollback.sql`);
	if (!fs.existsSync(sqlPath)) {
		return null;
	}
	return fs.readFileSync(sqlPath, 'utf8');
}

/**
 * List available rollback files.
 */
function listAvailableRollbacks(rollbacksDir: string): string[] {
	if (!fs.existsSync(rollbacksDir)) {
		return [];
	}
	return fs
		.readdirSync(rollbacksDir)
		.filter((f) => f.endsWith('.rollback.sql'))
		.map((f) => f.replace('.rollback.sql', ''))
		.sort((a, b) => b.localeCompare(a)); // Most recent first
}

/**
 * Execute a rollback for a specific migration.
 */
export function executeRollback(
	db: Database,
	rollbacksDir: string,
	tag: string,
	force: boolean
): void {
	const rollbackSql = readRollbackSql(rollbacksDir, tag);
	if (!rollbackSql) {
		console.error(`No rollback file found for: ${tag}`);
		console.log('\nTo create a rollback file:');
		console.log(`  1. Create: backend/drizzle/rollbacks/${tag}.rollback.sql`);
		console.log('  2. Include SQL to reverse the migration changes');
		process.exit(1);
	}

	console.log('\n⚠️  ROLLBACK WARNING ⚠️');
	console.log('='.repeat(50));
	console.log(`Rolling back: ${tag}`);
	console.log('This operation may be DESTRUCTIVE and result in DATA LOSS.');
	console.log('Ensure you have a database backup before proceeding.');
	console.log('='.repeat(50));

	if (!force) {
		console.log('\nRun with --force to confirm rollback execution.');
		console.log('Example: bun run db:migrate --rollback --force');
		return;
	}

	const statements = splitStatements(rollbackSql);

	console.log(`\nExecuting ${statements.length} rollback statement(s)...`);

	db.exec('BEGIN');
	try {
		for (const statement of statements) {
			try {
				db.exec(statement);
			} catch (err) {
				console.error(`\nFailed statement: ${statement.substring(0, 100)}...`);
				throw err;
			}
		}

		// Remove migration record
		const hash = computeHash(tag);
		db.query('DELETE FROM __drizzle_migrations WHERE hash = ?').run(hash);

		db.exec('COMMIT');
		console.log(`\n✓ Rollback completed: ${tag}`);
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}
}

/**
 * Show rollback status and available rollbacks.
 */
export function showRollbackStatus(paths: Paths): void {
	const journal = readJournal(paths.journalPath);
	const db = new Database(paths.database);

	try {
		const applied = getAppliedMigrations(db);
		const appliedHashes = new Set(applied.map((m) => m.hash));
		const availableRollbacks = listAvailableRollbacks(paths.rollbacksDir);

		console.log('Rollback Status:\n');
		console.log(`Database: ${paths.database}`);
		console.log(`Rollbacks: ${paths.rollbacksDir}\n`);

		if (availableRollbacks.length === 0) {
			console.log('No rollback files available.');
			return;
		}

		console.log('Applied migrations that can be rolled back:\n');

		for (const entry of [...journal.entries].reverse()) {
			const hash = computeHash(entry.tag);
			const isApplied = appliedHashes.has(hash);
			const hasRollback = availableRollbacks.includes(entry.tag);

			if (isApplied) {
				const rollbackStatus = hasRollback ? '✓' : '✗';
				console.log(
					`  ${rollbackStatus} ${entry.tag} ${hasRollback ? '(rollback available)' : '(no rollback file)'}`
				);
			}
		}

		console.log('\nUsage:');
		console.log('  bun run db:migrate --rollback <tag> --force');
	} finally {
		db.close();
	}
}
