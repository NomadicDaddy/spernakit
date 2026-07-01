/**
 * Pre-migration validation: NULL checks, unique-key duplicates, and foreign
 * key integrity, plus the --validate CLI mode.
 */
import { Database } from 'bun:sqlite';
import fs from 'node:fs';

import type { Paths, ValidationResult } from './types.ts';

/**
 * Validate database state before applying migrations.
 * Checks for NULL values in required columns, duplicate unique keys, and foreign key integrity.
 */
export function validatePreMigration(db: Database): ValidationResult {
	const issues: string[] = [];

	const nullChecks = [
		{ column: 'email', table: 'users' },
		{ column: 'username', table: 'users' },
		{ column: 'password_hash', table: 'users' },
		{ column: 'role', table: 'users' },
		{ column: 'name', table: 'workspaces' },
		{ column: 'slug', table: 'workspaces' },
		{ column: 'owner_id', table: 'workspaces' },
	];

	for (const check of nullChecks) {
		try {
			const result = db
				.query<{ count: number }, []>(
					`SELECT COUNT(*) as count FROM \`${check.table}\` WHERE \`${check.column}\` IS NULL`
				)
				.get();
			if (result && result.count > 0) {
				issues.push(`${check.table}.${check.column}: ${result.count} NULL values found`);
			}
		} catch {
			// Table or column may not exist yet - skip
		}
	}

	const uniqueChecks = [
		{ column: 'email', table: 'users' },
		{ column: 'username', table: 'users' },
		{ column: 'slug', table: 'workspaces' },
	];

	for (const check of uniqueChecks) {
		try {
			const result = db
				.query<{ count: number }, []>(
					`SELECT COUNT(*) as count FROM (
						SELECT \`${check.column}\` FROM \`${check.table}\`
						WHERE \`${check.column}\` IS NOT NULL
						GROUP BY \`${check.column}\`
						HAVING COUNT(*) > 1
					)`
				)
				.get();
			if (result && result.count > 0) {
				issues.push(
					`${check.table}.${check.column}: ${result.count} duplicate values found`
				);
			}
		} catch {
			// Table or column may not exist yet - skip
		}
	}

	try {
		const fkViolations = db.query<{ count: number }, []>('PRAGMA foreign_key_check').all();
		if (fkViolations.length > 0) {
			issues.push(`Foreign key violations: ${fkViolations.length} references broken`);
		}
	} catch {
		// Ignore if pragma fails
	}

	return { issues, valid: issues.length === 0 };
}

/**
 * Run pre-migration validation only without applying migrations.
 */
export function validateOnly(paths: Paths): void {
	console.log('Pre-Migration Validation\n');
	console.log(`Database: ${paths.database}\n`);

	if (!fs.existsSync(paths.database)) {
		console.log('✓ Database does not exist yet - validation skipped (fresh install)');
		return;
	}

	const db = new Database(paths.database);

	try {
		db.exec('PRAGMA foreign_keys = ON');
		const validation = validatePreMigration(db);

		console.log('Validation Results:\n');

		if (validation.valid) {
			console.log('✓ All validation checks passed');
			console.log('\nDatabase is in a valid state for migrations.');
		} else {
			console.log('❌ Validation failed with the following issues:\n');
			for (const issue of validation.issues) {
				console.log(`  - ${issue}`);
			}
			console.log('\nFix the above issues before running migrations.');
			process.exit(1);
		}
	} finally {
		db.close();
	}
}
