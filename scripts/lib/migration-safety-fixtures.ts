/**
 * Fixtures for scripts/test-migration-runner-safety.ts: throwaway migration folders and SQLite
 * files, journal readers, and a copy of the CLI runner loaded from a temp root so its migration
 * history file lands there instead of in this checkout's data/.
 */
import { Database } from 'bun:sqlite';
import crypto from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type * as Apply from './migrate/apply.ts';
import type { Paths } from './migrate/types.ts';

export type ApplyModule = typeof Apply;

const repoRoot = resolve(import.meta.dir, '..', '..');
export const BASE_SQL =
	'CREATE TABLE `parent` (`id` integer PRIMARY KEY NOT NULL);\n--> statement-breakpoint\n' +
	'CREATE TABLE `child` (`id` integer PRIMARY KEY NOT NULL, `parent_id` integer REFERENCES `parent`(`id`));';
export const ADD_SQL = 'ALTER TABLE `parent` ADD `name` text;';
export const BREAK_SQL =
	'PRAGMA foreign_keys=OFF;\n--> statement-breakpoint\n' +
	'INSERT INTO `child` (`id`, `parent_id`) VALUES (1, 99);\n--> statement-breakpoint\n' +
	'PRAGMA foreign_keys=ON;';
/** A journal table as written before content_hash existed. */
export const LEGACY_JOURNAL_SQL =
	'CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER)';

export function sha256(text: string): string {
	return crypto.createHash('sha256').update(text).digest('hex');
}

export function errorMessage(fn: () => void): null | string {
	try {
		fn();
		return null;
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
}

const tempRoots: string[] = [];
export function tempRoot(label: string): string {
	const dir = mkdtempSync(join(tmpdir(), `spernakit-migrate-safety-${label}-`));
	tempRoots.push(dir);
	return dir;
}

/** Remove every temp root. Statements cached by db.query keep a closed SQLite handle open on
 * Windows until collected, so collect first. */
export function removeTempRoots(): void {
	Bun.gc(true);
	for (const dir of tempRoots) {
		rmSync(dir, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
	}
}

/** A migrations folder holding the given tags, all of them listed in the journal unless unlisted. */
export function writeMigrations(
	root: string,
	files: Record<string, string>,
	unlisted: string[] = [],
): Paths {
	const migrationsDir = join(root, 'drizzle');
	mkdirSync(join(migrationsDir, 'meta'), { recursive: true });
	const entries = Object.keys(files)
		.filter((tag) => !unlisted.includes(tag))
		.map((tag, idx) => ({ breakpoints: true, idx, tag, version: '6', when: idx }));
	for (const [tag, sql] of Object.entries(files))
		writeFileSync(join(migrationsDir, `${tag}.sql`), sql);
	const journalPath = join(migrationsDir, 'meta', '_journal.json');
	writeFileSync(journalPath, JSON.stringify({ dialect: 'sqlite', entries, version: '7' }));
	return {
		database: join(root, 'test.db'),
		journalPath,
		migrationsDir,
		rollbacksDir: join(migrationsDir, 'rollbacks'),
	};
}

export function journalRows(dbPath: string): { content_hash: null | string; hash: string }[] {
	const db = new Database(dbPath);
	try {
		// Read a journal without the column as nulls, so a runner that never adds it fails the
		// content-hash checks instead of crashing this reader.
		const columns = db
			.query<{ name: string }, []>('PRAGMA table_info(__drizzle_migrations)')
			.all();
		const contentHash = columns.some((c) => c.name === 'content_hash')
			? 'content_hash'
			: 'NULL AS content_hash';
		return db
			.query<{ content_hash: null | string; hash: string }, []>(
				`SELECT hash, ${contentHash} FROM __drizzle_migrations ORDER BY id`,
			)
			.all();
	} finally {
		db.close();
	}
}

export function count(dbPath: string, sql: string): number {
	const db = new Database(dbPath);
	try {
		return db.query<{ n: number }, []>(sql).get()?.n ?? -1;
	} finally {
		db.close();
	}
}

export async function loadCliCopy(): Promise<ApplyModule> {
	const root = tempRoot('cli');
	cpSync(join(repoRoot, 'scripts', 'lib', 'migrate'), join(root, 'scripts', 'lib', 'migrate'), {
		recursive: true,
	});
	const url = pathToFileURL(join(root, 'scripts', 'lib', 'migrate', 'apply.ts')).href;
	return (await import(url)) as ApplyModule;
}

/** A database file with one foreign-key violation, plus an optional clean backup taken first. */
export function violatingDatabase(withBackup: boolean): { backupPath: string; dbPath: string } {
	const root = tempRoot('startup');
	const dbPath = join(root, 'app.db');
	const backupPath = join(root, 'app.db.pre-migrate.bak');
	const db = new Database(dbPath);
	db.exec(BASE_SQL.replaceAll('--> statement-breakpoint', ''));
	if (withBackup) db.prepare('VACUUM INTO ?').run(backupPath);
	db.exec('PRAGMA foreign_keys = OFF');
	db.exec('INSERT INTO `child` (`id`, `parent_id`) VALUES (1, 99)');
	db.close();
	return { backupPath, dbPath };
}
