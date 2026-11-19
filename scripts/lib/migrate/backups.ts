/**
 * Retention for the CLI runner's pre-migration backups.
 *
 * Every run with pending migrations writes a full `VACUUM INTO` copy of the database beside it,
 * and nothing removed them, so the data directory grew by one database per migrating run. Older
 * releases also copied the database on every container start (`docker/start.sh`), with names of
 * their own. This keeps the newest few of both kinds and deletes the rest. The startup runner's
 * single fixed-name backup (`<db>.pre-migrate.bak`, overwritten each time) is never touched.
 */
import fs from 'node:fs';
import path from 'node:path';

/** How many timestamped pre-migration backups to keep beside the database. */
export const PRE_MIGRATE_BACKUPS_KEPT = 5;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function warn(what: string, err: unknown): void {
	console.warn(`  ⚠ ${what}: ${err instanceof Error ? err.message : String(err)}`);
}

/** The other timestamped backups of the database, newest first; empty if they cannot be listed. */
function olderBackups(databasePath: string, current: string): { file: string; mtime: number }[] {
	const dir = path.dirname(databasePath);
	const base = escapeRegExp(path.basename(databasePath));
	const pattern = new RegExp(
		`^${base}\\.pre-migrate(?:-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z|\\.\\d{14})\\.bak$`,
	);
	let names: string[];
	try {
		names = fs.readdirSync(dir);
	} catch (err) {
		warn(`Could not list ${dir} to prune old pre-migration backups`, err);
		return [];
	}
	const backups: { file: string; mtime: number }[] = [];
	for (const name of names.filter((entry) => pattern.test(entry))) {
		const file = path.join(dir, name);
		if (path.resolve(file) === path.resolve(current)) continue;
		try {
			// Only regular files count, read without following links, so a directory or a link
			// that happens to match the name never takes a slot from a real backup.
			const stats = fs.lstatSync(file);
			if (stats.isFile()) backups.push({ file, mtime: stats.mtimeMs });
		} catch (err) {
			warn(`Could not read ${file}; leaving it`, err);
		}
	}
	return backups.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Delete all but the newest `keep` timestamped pre-migration backups of `databasePath`: the
 * runner's `<db>.pre-migrate-<ISO time>.bak` and the old entrypoint's `<db>.pre-migrate.<14
 * digits>.bak`. The backup this run just took always counts as one of the kept, whatever its
 * timestamp says. Retention is best-effort: a directory that cannot be listed, or a file that
 * cannot be read or deleted, is reported and left, so retention never stops a migration or a
 * container start.
 *
 * @param databasePath - The database the backups were taken of
 * @param current - The backup this run just took, which is never deleted
 * @param keep - How many to keep, the current one included
 * @returns The backups deleted
 */
export function prunePreMigrateBackups(
	databasePath: string,
	current: string,
	keep: number = PRE_MIGRATE_BACKUPS_KEPT,
): string[] {
	const deleted: string[] = [];
	for (const { file } of olderBackups(databasePath, current).slice(Math.max(0, keep - 1))) {
		try {
			fs.unlinkSync(file);
			deleted.push(file);
		} catch (err) {
			warn(`Could not delete old pre-migration backup ${file}`, err);
		}
	}
	return deleted;
}
