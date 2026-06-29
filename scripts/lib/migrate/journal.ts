/**
 * Drizzle journal and migration SQL file access, plus hash helpers.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { DrizzleJournal } from './types.ts';

/**
 * Read the drizzle journal file.
 */
export function readJournal(journalPath: string): DrizzleJournal {
	if (!fs.existsSync(journalPath)) {
		throw new Error(`Journal file not found: ${journalPath}\nRun 'bun run db:generate' first.`);
	}

	const content = fs.readFileSync(journalPath, 'utf8');
	return JSON.parse(content) as DrizzleJournal;
}

/**
 * Read a migration SQL file.
 */
export function readMigrationSql(migrationsDir: string, tag: string): string {
	const sqlPath = path.join(migrationsDir, `${tag}.sql`);
	if (!fs.existsSync(sqlPath)) {
		throw new Error(`Migration file not found: ${sqlPath}`);
	}
	return fs.readFileSync(sqlPath, 'utf8');
}

/**
 * Compute hash for a migration tag (matches drizzle-kit's format).
 * Uses the tag name as input to maintain compatibility with drizzle-kit's
 * migration tracking in __drizzle_migrations.
 */
export function computeHash(tag: string): string {
	return crypto.createHash('sha256').update(tag).digest('hex');
}

/**
 * Compute a content hash for verifying migration SQL integrity.
 * Unlike computeHash (which hashes the tag name for drizzle compatibility),
 * this hashes the actual SQL to detect tampering.
 */
export function computeContentHash(sql: string): string {
	return crypto.createHash('sha256').update(sql).digest('hex');
}
