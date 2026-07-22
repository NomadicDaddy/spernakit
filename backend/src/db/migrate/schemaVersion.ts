import { Database } from 'bun:sqlite';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import type { DrizzleJournal } from './journal.ts';

import { logger } from '../../utils/logger.ts';
import { resolveJournalPathFromDb } from './discovery.ts';

function getSchemaVersion(dbPath: string): string {
	if (!existsSync(dbPath)) {
		return 'unknown';
	}

	try {
		const db = new Database(dbPath, { readonly: true });
		try {
			if (!migrationsTableExists(db)) return 'unknown';

			const migrations = db
				.query<{ hash: string }, []>(
					'SELECT hash FROM __drizzle_migrations ORDER BY id DESC LIMIT 1'
				)
				.all();
			if (migrations.length === 0) return 'unknown';

			const journalPath = resolveJournalPathFromDb(dbPath);
			if (!journalPath) return 'unknown';

			return findJournalTagForHash(journalPath, migrations[0]?.hash);
		} finally {
			db.close();
		}
	} catch (err) {
		logger.warn(
			{ dbPath, err },
			'Failed to resolve schema version - migrations table or journal may be corrupted'
		);
		return 'unknown';
	}
}

function migrationsTableExists(db: Database): boolean {
	const tableExists = db
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
		)
		.all();
	return tableExists.length > 0;
}

function findJournalTagForHash(journalPath: string, lastHash: string | undefined): string {
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as DrizzleJournal;
	const entry = journal.entries.find((e) => {
		const hash = crypto.createHash('sha256').update(e.tag).digest('hex');
		return hash === lastHash;
	});
	return entry?.tag ?? 'unknown';
}

export { getSchemaVersion };
