#!/usr/bin/env bun
/**
 * Reset Database Script
 *
 * Removes the SQLite database, WAL/SHM files, and the .seeded marker
 * from the data/ directory. The database will be re-created and re-seeded
 * automatically when the backend starts.
 *
 * Safety guards:
 * - Refuses to run when NODE_ENV === 'production'.
 * - Requires --force when any target database contains user rows.
 *
 * Usage:
 *   bun scripts/reset-database.ts [--force]
 */
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV === 'production') {
	console.error('   Refusing to reset the database: NODE_ENV is set to production.');
	process.exit(1);
}

const force = process.argv.includes('--force');
const dataDir = path.resolve(import.meta.dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
	console.log('   No data/ directory found — nothing to reset.');
	process.exit(0);
}

/** Count rows in users; returns 0 when the db is unreadable or has no users table. */
function countUsers(dbPath: string): number {
	try {
		const db = new Database(dbPath, { readonly: true });
		try {
			const row = db
				.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM users')
				.get();
			return row?.count ?? 0;
		} finally {
			db.close();
		}
	} catch {
		return 0;
	}
}

const targets = fs
	.readdirSync(dataDir)
	.filter(
		(file) =>
			file.endsWith('.db') ||
			file.endsWith('.db-shm') ||
			file.endsWith('.db-wal') ||
			file === '.seeded'
	);

if (targets.length === 0) {
	console.log('   Cleared 0 database files from data/');
	process.exit(0);
}

console.log('   Will delete from data/:');
for (const file of targets) {
	console.log(`     - ${file}`);
}

if (!force) {
	const populated = targets
		.filter((file) => file.endsWith('.db'))
		.filter((file) => countUsers(path.join(dataDir, file)) > 0);
	if (populated.length > 0) {
		console.error(
			`   Refusing to reset: ${populated.join(', ')} contain${populated.length === 1 ? 's' : ''} user data. ` +
				'Re-run with --force to delete anyway.'
		);
		process.exit(1);
	}
}

let removed = 0;
for (const file of targets) {
	fs.unlinkSync(path.join(dataDir, file));
	removed++;
}

console.log(`   Cleared ${removed} database file${removed !== 1 ? 's' : ''} from data/`);
