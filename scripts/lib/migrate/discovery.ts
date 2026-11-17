/**
 * Pending-migration discovery for the CLI runner, with the same refusals and warnings as the
 * startup runner (backend/src/db/migrate/discovery.ts):
 * - a .sql file on disk that the journal does not list is drift, and the run refuses;
 * - an applied row whose hash matches no journal tag was written by another tool (drizzle-kit
 *   migrate hashes file contents) or the journal was edited, and the run refuses rather than
 *   treating the database as unmigrated;
 * - an applied migration whose file no longer matches its recorded content hash gets a loud
 *   warning and is never re-run.
 */
import type { Database } from 'bun:sqlite';

import fs from 'node:fs';
import path from 'node:path';

import type { DrizzleJournal, JournalEntry } from './types.ts';

import { computeContentHash, computeHash } from './journal.ts';
import { getAppliedMigrations } from './records.ts';

/** Refuse when a migration .sql file exists on disk but is not registered in the journal. */
export function assertNoOrphanedMigrations(migrationsDir: string, journal: DrizzleJournal): void {
	if (!fs.existsSync(migrationsDir)) return;
	const journaledTags = new Set(journal.entries.map((e) => e.tag));
	const orphaned = fs
		.readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.map((f) => f.replace(/\.sql$/, ''))
		.filter((tag) => !journaledTags.has(tag));
	if (orphaned.length === 0) return;
	throw new Error(
		`Migration drift: ${orphaned.length} .sql file(s) exist on disk but are not registered in ` +
			`_journal.json: ${orphaned.join(', ')}. Delete the orphaned files or add them to the ` +
			`journal. Refusing to proceed.`,
	);
}

function warnOnContentMismatch(migrationsDir: string, tag: string, recorded: string): void {
	const sqlPath = path.join(migrationsDir, `${tag}.sql`);
	if (!fs.existsSync(sqlPath)) return;
	const current = computeContentHash(fs.readFileSync(sqlPath, 'utf8'));
	if (current === recorded) return;
	console.warn(
		`  ⚠ MIGRATION CONTENT MISMATCH: ${tag}.sql differs from the content recorded when it was ` +
			`applied. It will NOT be re-run. Verify the schema matches expectations.`,
	);
}

/**
 * Return the journal entries not yet applied. Throws when an applied row matches no journal tag.
 */
export function selectPendingMigrations(
	db: Database,
	journal: DrizzleJournal,
	migrationsDir: string,
): JournalEntry[] {
	const entryByHash = new Map(journal.entries.map((e) => [computeHash(e.tag), e]));
	const appliedHashes = new Set<string>();
	const unknownHashes: string[] = [];
	for (const record of getAppliedMigrations(db)) {
		const entry = entryByHash.get(record.hash);
		if (!entry) {
			unknownHashes.push(record.hash);
			continue;
		}
		appliedHashes.add(record.hash);
		if (record.content_hash) {
			warnOnContentMismatch(migrationsDir, entry.tag, record.content_hash);
		}
	}

	if (unknownHashes.length > 0) {
		throw new Error(
			`__drizzle_migrations contains ${unknownHashes.length} record(s) whose hash matches no ` +
				`journal tag. They were likely written by another tool (e.g. drizzle-kit migrate, ` +
				`which hashes file contents) or the journal was modified. Refusing to proceed - ` +
				`reconcile the migration journal manually instead of treating the database as unmigrated.`,
		);
	}

	return journal.entries.filter((entry) => !appliedHashes.has(computeHash(entry.tag)));
}
