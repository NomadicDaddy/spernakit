#!/usr/bin/env bun
/**
 * Gate: the CLI and startup migration runners carry the same safety guarantees
 * (`.aidd/features/migration-runner-safety`).
 *
 * CLI runner (scripts/lib/migrate), run from a copy in a temp root so its migration history file
 * lands there and not in this checkout's data/:
 *  1. A clean migration applies and its journal row records the SQL's content hash.
 *  2. A journal created with only (hash, created_at) gains content_hash additively; the legacy row
 *     keeps null and the next migration's row gets its hash.
 *  3. An applied row whose hash matches no journal tag refuses the run, and nothing is applied.
 *  4. A .sql file the journal does not list refuses the run.
 *  5. A migration that leaves a foreign-key violation fails before COMMIT: no journal row, no
 *     data. A control proves the fixture really produces a violation foreign_key_check reports.
 *  6. --baseline records content hashes too.
 * 11. A migrating run keeps the newest five timestamped pre-migration backups (both namings) and
 *     leaves the startup runner's fixed-name backup and unrelated files alone.
 * 12. Retention keeps the backup the run just took even when its timestamp is the oldest, and a
 *     directory it cannot list makes it warn and delete nothing rather than throw.
 * Startup runner (backend/src/db/migrate/execution.ts assertPostMigrationIntegrity):
 *  7. A failed post-check with no backup refuses startup instead of returning.
 *  8. A failed restore says the restore failed, never that the database was restored.
 *  9. A successful restore says so, and the restored file is the clean backup.
 * 10. A clean database passes.
 */
import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { assertPostMigrationIntegrity } from '../backend/src/db/migrate/execution.ts';
import { prunePreMigrateBackups } from './lib/migrate/backups.ts';
import {
	ADD_SQL,
	type ApplyModule,
	BASE_SQL,
	BREAK_SQL,
	count,
	errorMessage,
	journalRows,
	LEGACY_JOURNAL_SQL,
	loadCliCopy,
	removeTempRoots,
	sha256,
	tempRoot,
	violatingDatabase,
	writeMigrations,
} from './lib/migration-safety-fixtures.ts';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * 11. A migrating run keeps the newest five timestamped pre-migration backups, of both the
 * runner's and the old entrypoint's naming, and leaves the startup runner's fixed-name backup and
 * unrelated files alone.
 */
function retentionCase(cli: ApplyModule): void {
	const paths = writeMigrations(tempRoot('retention'), { '0001_base': BASE_SQL });
	const dir = dirname(paths.database);
	const old = [
		'test.db.pre-migrate-2026-01-01T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260102000000.bak',
		'test.db.pre-migrate-2026-01-03T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260104000000.bak',
		'test.db.pre-migrate-2026-01-05T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260106000000.bak',
		'test.db.pre-migrate-2026-01-07T00-00-00-000Z.bak',
	];
	const untouched = ['test.db.pre-migrate.bak', 'test.db.other.bak'];
	old.forEach((name, day) => {
		const file = join(dir, name);
		writeFileSync(file, 'old backup');
		const when = new Date(Date.UTC(2026, 0, day + 1));
		utimesSync(file, when, when);
	});
	for (const name of untouched) writeFileSync(join(dir, name), 'keep');
	cli.runMigrations(paths);

	const timestamped = readdirSync(dir).filter(
		(name) => /\.pre-migrate[.-].+\.bak$/.test(name) && name !== 'test.db.pre-migrate.bak',
	);
	assert(
		timestamped.length === 5,
		`11: five backups should remain, got ${timestamped.join(', ')}`,
	);
	assert(
		old.slice(3).every((name) => timestamped.includes(name)),
		`11: the four newest old backups should be kept, got ${timestamped.join(', ')}`,
	);
	assert(
		untouched.every((name) => existsSync(join(dir, name))),
		"11: the startup runner's backup and unrelated files must be left alone",
	);
}

/** 12. The just-taken backup always survives, and an unlistable directory never throws. */
function retentionGuardsCase(): void {
	const dir = tempRoot('retention-guards');
	const database = join(dir, 'test.db');
	const names = [1, 2, 3, 4, 5, 6].map(
		(day) => `test.db.pre-migrate-2026-02-0${String(day)}T00-00-00-000Z.bak`,
	);
	names.forEach((name, index) => {
		const file = join(dir, name);
		writeFileSync(file, 'backup');
		// The first one is the run's own backup, dated oldest as if the clock had gone back.
		const when = new Date(Date.UTC(2026, 1, index + 1));
		utimesSync(file, when, when);
	});
	const current = join(dir, names[0] ?? '');
	prunePreMigrateBackups(database, current);
	assert(existsSync(current), '12: the backup the run just took must never be pruned');
	const left = readdirSync(dir).filter((name) => name.endsWith('.bak'));
	assert(left.length === 5, `12: five backups should remain, got ${left.join(', ')}`);

	let threw = false;
	try {
		prunePreMigrateBackups(
			join(dir, 'missing-dir', 'test.db'),
			join(dir, 'missing-dir', 'x.bak'),
		);
	} catch {
		threw = true;
	}
	assert(!threw, '12: an unlistable directory must not throw');
}

function cliCases(cli: ApplyModule): void {
	// 1. Clean apply records the content hash.
	const clean = writeMigrations(tempRoot('clean'), { '0001_base': BASE_SQL });
	cli.runMigrations(clean);
	const cleanRows = journalRows(clean.database);
	assert(
		cleanRows.length === 1 && cleanRows[0]?.content_hash === sha256(BASE_SQL),
		`1: clean apply should record content_hash ${sha256(BASE_SQL)}, got ${JSON.stringify(cleanRows)}`,
	);

	// 2. Legacy journal without content_hash.
	const legacy = writeMigrations(tempRoot('legacy'), {
		'0001_base': BASE_SQL,
		'0002_add': ADD_SQL,
	});
	const legacyDb = new Database(legacy.database);
	legacyDb.exec(BASE_SQL.replaceAll('--> statement-breakpoint', ''));
	legacyDb.exec(LEGACY_JOURNAL_SQL);
	legacyDb
		.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
		.run(sha256('0001_base'), 1);
	legacyDb.close();
	cli.runMigrations(legacy);
	const legacyRows = journalRows(legacy.database);
	assert(
		legacyRows.length === 2 &&
			legacyRows[0]?.content_hash === null &&
			legacyRows[1]?.content_hash === sha256(ADD_SQL),
		`2: legacy row should keep null and the new row get its hash, got ${JSON.stringify(legacyRows)}`,
	);

	// 3. Unknown applied hash refuses.
	const unknown = writeMigrations(tempRoot('unknown'), { '0001_base': BASE_SQL });
	const unknownDb = new Database(unknown.database);
	unknownDb.exec(LEGACY_JOURNAL_SQL);
	unknownDb
		.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
		.run(sha256('drizzle-kit-content'), 1);
	unknownDb.close();
	const unknownError = errorMessage(() => cli.runMigrations(unknown));
	assert(
		unknownError?.includes('matches no journal tag') === true,
		`3: unknown hash should refuse, got ${unknownError}`,
	);
	assert(
		count(unknown.database, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'parent'") ===
			0,
		'3: nothing should be applied after an unknown-hash refusal',
	);

	// 4. Orphaned .sql file refuses.
	const orphan = writeMigrations(
		tempRoot('orphan'),
		{ '0001_base': BASE_SQL, '0002_stray': ADD_SQL },
		['0002_stray'],
	);
	const orphanError = errorMessage(() => cli.runMigrations(orphan));
	assert(
		orphanError?.includes('Migration drift') === true,
		`4: orphaned file should refuse, got ${orphanError}`,
	);

	// 5. Foreign-key violation fails before COMMIT, with a control that the fixture violates.
	const control = new Database(':memory:');
	control.exec(BASE_SQL.replaceAll('--> statement-breakpoint', ''));
	control.exec('PRAGMA foreign_keys = OFF');
	control.exec('INSERT INTO `child` (`id`, `parent_id`) VALUES (1, 99)');
	assert(
		control.query('PRAGMA foreign_key_check').all().length === 1,
		'5: control fixture should report one violation',
	);
	control.close();
	const broken = writeMigrations(tempRoot('fk'), {
		'0001_base': BASE_SQL,
		'0002_break': BREAK_SQL,
	});
	const fkError = errorMessage(() => cli.runMigrations(broken));
	assert(
		fkError?.includes('Foreign key check failed in migration 0002_break') === true,
		`5: FK violation should fail, got ${fkError}`,
	);
	assert(
		journalRows(broken.database).length === 1,
		'5: the failed migration must not be recorded as applied',
	);
	assert(
		count(broken.database, 'SELECT COUNT(*) AS n FROM child') === 0,
		"5: the failed migration's rows must be rolled back",
	);

	// 6. Baseline records content hashes.
	const baseline = writeMigrations(tempRoot('baseline'), { '0001_base': BASE_SQL });
	cli.baselineMigration(baseline);
	const baselineRows = journalRows(baseline.database);
	assert(
		baselineRows[0]?.content_hash === sha256(BASE_SQL),
		`6: baseline should record content_hash, got ${JSON.stringify(baselineRows)}`,
	);
}

function startupCases(): void {
	// 7. No backup: refuse.
	const noBackup = violatingDatabase(false);
	const noBackupDb = new Database(noBackup.dbPath);
	const noBackupError = errorMessage(() =>
		assertPostMigrationIntegrity(noBackupDb, noBackup.dbPath, undefined),
	);
	noBackupDb.close();
	assert(
		noBackupError?.includes('no pre-migration backup exists') === true &&
			noBackupError.includes('Startup refused'),
		`7: no-backup failure should refuse startup, got ${noBackupError}`,
	);

	// 8. Failed restore: the backup path does not exist.
	const failed = violatingDatabase(false);
	const failedDb = new Database(failed.dbPath);
	const failedError = errorMessage(() =>
		assertPostMigrationIntegrity(failedDb, failed.dbPath, failed.backupPath),
	);
	assert(
		failedError?.includes('FAILED') === true && !failedError.includes('Database restored'),
		`8: failed restore should say so, got ${failedError}`,
	);

	// 9. Successful restore.
	const restored = violatingDatabase(true);
	const restoredDb = new Database(restored.dbPath);
	const restoredError = errorMessage(() =>
		assertPostMigrationIntegrity(restoredDb, restored.dbPath, restored.backupPath),
	);
	assert(
		restoredError?.includes('Database restored from the pre-migration backup') === true,
		`9: successful restore should say so, got ${restoredError}`,
	);
	assert(
		count(restored.dbPath, 'SELECT COUNT(*) AS n FROM child') === 0,
		'9: the restored file should be the clean backup',
	);

	// 10. Clean database passes.
	const cleanRoot = tempRoot('startup-clean');
	const cleanDb = new Database(join(cleanRoot, 'app.db'));
	cleanDb.exec(BASE_SQL.replaceAll('--> statement-breakpoint', ''));
	const cleanError = errorMessage(() =>
		assertPostMigrationIntegrity(cleanDb, join(cleanRoot, 'app.db'), undefined),
	);
	cleanDb.close();
	assert(cleanError === null, `10: a clean database should pass, got ${cleanError}`);
}

try {
	const cli = await loadCliCopy();
	cliCases(cli);
	retentionCase(cli);
	retentionGuardsCase();
	startupCases();
} finally {
	removeTempRoots();
}

if (failures.length > 0) {
	console.error(`migration runner safety: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('migration runner safety: all 12 checks passed');
