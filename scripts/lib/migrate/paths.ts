/**
 * Path resolution and config helpers for the database migration script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Paths } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Repository root (this file lives at scripts/lib/migrate/). */
export const repoRoot = path.resolve(path.join(__dirname, '..', '..', '..'));

/**
 * Get paths for migration files and database.
 */
export function getPaths(appSlug: string): Paths {
	const backendDir = path.join(repoRoot, 'backend');
	const migrationsDir = path.join(backendDir, 'drizzle');
	const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
	const database = path.join(repoRoot, 'data', `${appSlug}.db`);
	const rollbacksDir = path.join(migrationsDir, 'rollbacks');

	return { database, journalPath, migrationsDir, rollbacksDir };
}

/**
 * Check configured database dialect from config file.
 * Returns 'sqlite' if config is unreadable or dialect is not set.
 */
export function getConfiguredDialect(appSlug: string): string {
	try {
		const configPath = path.join(repoRoot, 'config', `${appSlug}.json`);
		const raw = fs.readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw) as { database?: { dialect?: string } };
		return parsed.database?.dialect ?? 'sqlite';
	} catch {
		return 'sqlite';
	}
}
