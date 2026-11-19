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

/**
 * Delete all but the newest `keep` timestamped pre-migration backups of `databasePath`: the
 * runner's `<db>.pre-migrate-<ISO time>.bak` and the old entrypoint's `<db>.pre-migrate.<14
 * digits>.bak`. Newest is judged by modification time. A file that cannot be deleted is reported
 * and left, so retention never stops a migration.
 *
 * @param databasePath - The database the backups were taken of
 * @param keep - How many to keep
 * @returns The backups deleted
 */
export function prunePreMigrateBackups(
	databasePath: string,
	keep: number = PRE_MIGRATE_BACKUPS_KEPT,
): string[] {
	const dir = path.dirname(databasePath);
	const base = escapeRegExp(path.basename(databasePath));
	const pattern = new RegExp(
		`^${base}\\.pre-migrate(?:-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z|\\.\\d{14})\\.bak$`,
	);
	const backups = fs
		.readdirSync(dir)
		.filter((name) => pattern.test(name))
		.map((name) => {
			const file = path.join(dir, name);
			return { file, mtime: fs.statSync(file).mtimeMs };
		})
		.sort((a, b) => b.mtime - a.mtime);

	const deleted: string[] = [];
	for (const { file } of backups.slice(keep)) {
		try {
			fs.unlinkSync(file);
			deleted.push(file);
		} catch (err) {
			console.warn(
				`  ⚠ Could not delete old pre-migration backup ${file}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
	return deleted;
}
