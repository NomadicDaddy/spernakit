import { type Stats, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { getConfig } from '../../config/configLoader.ts';
import { projectRoot } from '../../config/configUtils.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { logger } from '../../utils/logger.ts';

/** Pattern matching all backup file variants: .backup.db, .backup.db.gz, .backup.db.enc, .backup.db.gz.enc */
const BACKUP_FILE_PATTERN = /\.backup\.db(\.gz)?(\.enc)?$/;

/** Extract timestamp from backup filename */
const BACKUP_TIMESTAMP_PATTERN =
	/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.backup\.db(\.gz)?(\.enc)?$/;

/** Minimum number of backups to keep regardless of retention age */
const MIN_RETENTION_COUNT = 3;

interface BackupFileEntry {
	filename: string;
	path: string;
	stats: Stats;
}

/**
 * Read and filter backup files from the backup directory.
 *
 * @returns Array of backup file entries matching the backup pattern
 */
function getBackupFiles(): BackupFileEntry[] {
	const backupDir = getBackupDirectory();
	const entries: BackupFileEntry[] = [];

	try {
		const files = readdirSync(backupDir);
		for (const file of files) {
			if (!BACKUP_FILE_PATTERN.test(file)) continue;
			const filePath = join(backupDir, file);
			entries.push({ filename: file, path: filePath, stats: statSync(filePath) });
		}
	} catch (err) {
		logger.error(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			'Failed to read backup directory'
		);
	}

	return entries;
}

/**
 * Parse timestamp from a backup filename.
 * Returns epoch ms if pattern matches, or null if filename has no embedded timestamp.
 *
 * @param filename - Backup filename to parse
 * @returns Epoch milliseconds or null if no timestamp found
 */
function parseFilenameTimestamp(filename: string): null | number {
	const match = BACKUP_TIMESTAMP_PATTERN.exec(filename);
	if (!match?.[1]) return null;
	// Filename timestamp format: YYYY-MM-DDTHH-MM-SS → convert to ISO: YYYY-MM-DDTHH:MM:SS
	// Filenames are written from toISOString() (UTC), so parse as UTC ('Z' suffix) —
	// Date.parse without an offset would interpret the string as local time.
	const isoStr = match[1].replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
	const ms = Date.parse(`${isoStr}Z`);
	return Number.isNaN(ms) ? null : ms;
}

interface BackupFile {
	compressed: boolean;
	encrypted: boolean;
	filename: string;
	sizeBytes: number;
	timestamp: string;
}

/**
 * Get the backup directory path, ensuring it exists.
 *
 * @returns Absolute path to backup directory
 */
export function getBackupDirectory(): string {
	const config = getConfig();
	const backupDir = resolve(projectRoot, config.database.backup.location);

	if (!existsSync(backupDir)) {
		mkdirSync(backupDir, { mode: 0o700, recursive: true });
		logger.info({ path: backupDir }, 'Created backup directory');
	}

	return backupDir;
}

/**
 * Generate a timestamped backup filename.
 *
 * @param dbPath - Path to original database file
 * @returns Backup filename with timestamp
 */
export function generateBackupFilename(dbPath: string): string {
	const dbName = basename(dbPath, '.db');
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	return `${dbName}.${timestamp}.backup.db`;
}

/**
 * Clean up backups older than retention period using async I/O.
 * Preserves a minimum number of backups regardless of age.
 *
 * @returns Number of backups deleted
 */
export async function cleanupOldBackups(): Promise<number> {
	const config = getConfig();
	const retentionMs = config.database.backup.retentionDays * MS_PER_DAY;
	const cutoffTime = Date.now() - retentionMs;
	const backupDir = getBackupDirectory();
	let deletedCount = 0;

	try {
		const files = await readdir(backupDir);
		const backupFiles: { filename: string; path: string; timestampMs: number }[] = [];

		for (const file of files) {
			if (!BACKUP_FILE_PATTERN.test(file)) continue;
			const filePath = join(backupDir, file);
			const filenameTs = parseFilenameTimestamp(file);
			const timestampMs = filenameTs ?? (await stat(filePath)).mtimeMs;
			backupFiles.push({ filename: file, path: filePath, timestampMs });
		}

		// Sort newest first and always retain the newest MIN_RETENTION_COUNT backups;
		// only older files beyond that floor are eligible for age-based deletion
		backupFiles.sort((a, b) => b.timestampMs - a.timestampMs);

		for (const entry of backupFiles.slice(MIN_RETENTION_COUNT)) {
			if (entry.timestampMs < cutoffTime) {
				await unlink(entry.path);
				deletedCount++;
				logger.info({ file: entry.filename }, 'Deleted old backup');
			}
		}
	} catch (err) {
		logger.error(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			'Backup retention cleanup failed'
		);
	}

	if (deletedCount > 0) {
		logger.info({ count: deletedCount }, 'Backup retention cleanup completed');
	}

	return deletedCount;
}

/**
 * List available backups.
 *
 * @returns Array of backup file information
 */
export function listBackups(): BackupFile[] {
	const backups: BackupFile[] = [];

	for (const entry of getBackupFiles()) {
		const filenameTs = parseFilenameTimestamp(entry.filename);
		const timestamp = filenameTs
			? new Date(filenameTs).toISOString()
			: entry.stats.mtime.toISOString();

		backups.push({
			compressed: entry.filename.includes('.backup.db.gz'),
			encrypted: entry.filename.endsWith('.enc'),
			filename: entry.filename,
			sizeBytes: entry.stats.size,
			timestamp,
		});
	}

	backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	return backups;
}
