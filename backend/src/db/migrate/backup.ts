import { type Database } from 'bun:sqlite';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';

const PRE_MIGRATE_BACKUP_SUFFIX = '.pre-migrate.bak';

/**
 * Create a WAL-safe pre-migration snapshot on the migration connection.
 * A plain file copy of a live WAL database misses un-checkpointed pages, so
 * checkpoint first and use VACUUM INTO for a consistent single-file snapshot
 * (same approach as the CLI migration runner).
 */
function createPreMigrationBackup(db: Database, dbPath: string): string {
	const backupPath = dbPath + PRE_MIGRATE_BACKUP_SUFFIX;
	// VACUUM INTO refuses to overwrite an existing file — clear a stale backup first
	if (existsSync(backupPath)) {
		unlinkSync(backupPath);
	}
	db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	db.prepare('VACUUM INTO ?').run(backupPath);
	return backupPath;
}

function restoreFromBackup(dbPath: string, backupPath: string): void {
	// Remove stale WAL/SHM sidecars so the restored file is not paired with them
	for (const suffix of ['-wal', '-shm']) {
		const sidecarPath = dbPath + suffix;
		if (existsSync(sidecarPath)) {
			unlinkSync(sidecarPath);
		}
	}
	copyFileSync(backupPath, dbPath);
}

function removePreMigrationBackup(backupPath: string): void {
	try {
		if (existsSync(backupPath)) {
			unlinkSync(backupPath);
		}
	} catch {
		// Non-critical — don't fail startup over backup cleanup
	}
}

export {
	createPreMigrationBackup,
	PRE_MIGRATE_BACKUP_SUFFIX,
	removePreMigrationBackup,
	restoreFromBackup,
};
