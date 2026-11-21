/**
 * The throwaway database every in-process regression gate starts its application on.
 *
 * Each gate used to build this by hand: a temp directory, the migrations applied to a SQLite file
 * inside it, that file opened as the application's database, and on the way out the database closed
 * and the directory removed. That part never varied, so it lives here.
 *
 * What does vary stays with each gate: how it mutates the loaded config, which users it seeds and
 * in what order, and what it builds on top. So this takes no options; a gate calls it between its
 * own config setup and its own seeding.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UserRole } from '../../backend/src/types/roles.ts';

import { runAutoMigrations } from '../../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../../backend/src/db/index.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';

/** An open, migrated temp-file database, and the way to close and remove it. */
interface TempDatabase {
	dbPath: string;
	dispose: () => Promise<void>;
}

/**
 * Migrate a SQLite file in a fresh temp directory and open it as the application's database.
 *
 * @param repoRoot - Absolute path to the repository root, which is where the migrations are.
 * @param prefix - The temp directory's name prefix, so a leftover one says which gate made it.
 * @returns The database file's path, and a `dispose` that closes the database, then removes the
 *   directory.
 */
function startTempDatabase(repoRoot: string, prefix: string): TempDatabase {
	const tmpDir = mkdtempSync(join(tmpdir(), prefix));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	return {
		dbPath,
		dispose: async () => {
			await closeDatabase();
			try {
				rmSync(tmpDir, { force: true, recursive: true });
			} catch {
				// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
			}
		},
	};
}

/** The id of a seeded account, looked up by the role the seed gave it. */
function seedUserId(role: UserRole): number {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === role);
	if (!seed) throw new Error(`SEED_USERS carries no ${role} account`);
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === seed.username);
	if (!row) throw new Error(`the seed produced no ${seed.username} account`);
	return row.id;
}

export type { TempDatabase };
export { seedUserId, startTempDatabase };
