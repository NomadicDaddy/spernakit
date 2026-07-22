/**
 * Migration history persistence (data/migration-history.json).
 */
import fs from 'node:fs';
import path from 'node:path';

import type { MigrationHistoryEntry } from './types.ts';

import { repoRoot } from './paths.ts';

/** Path to migration history file */
function getMigrationHistoryPath(): string {
	return path.join(repoRoot, 'data', 'migration-history.json');
}

/** Read existing migration history from JSON file */
function readMigrationHistory(): MigrationHistoryEntry[] {
	const historyPath = getMigrationHistoryPath();
	if (!fs.existsSync(historyPath)) {
		return [];
	}
	try {
		const content = fs.readFileSync(historyPath, 'utf8');
		return JSON.parse(content) as MigrationHistoryEntry[];
	} catch {
		return [];
	}
}

/** Keep at most this many recent entries per migrationTag. */
const MAX_HISTORY_ENTRIES_PER_TAG = 3;

/** Hard cap on total history entries retained across all tags. */
const MAX_MIGRATION_HISTORY_ENTRIES = 200;

/**
 * Prune a migration history array so that each migrationTag retains only its
 * N most recent entries, and the overall length is capped. Preserves input
 * order between entries of different tags.
 */
function pruneMigrationHistory(history: MigrationHistoryEntry[]): MigrationHistoryEntry[] {
	const perTagRecentCount = new Map<string, number>();
	const pruned: MigrationHistoryEntry[] = [];
	for (let i = history.length - 1; i >= 0; i--) {
		const entry = history[i];
		if (!entry) continue;
		const count = perTagRecentCount.get(entry.migrationTag) ?? 0;
		if (count < MAX_HISTORY_ENTRIES_PER_TAG) {
			pruned.push(entry);
			perTagRecentCount.set(entry.migrationTag, count + 1);
		}
	}
	pruned.reverse();
	if (pruned.length > MAX_MIGRATION_HISTORY_ENTRIES) {
		return pruned.slice(pruned.length - MAX_MIGRATION_HISTORY_ENTRIES);
	}
	return pruned;
}

/** Append a migration history entry to the JSON file */
function appendMigrationHistory(entry: MigrationHistoryEntry): void {
	const historyPath = getMigrationHistoryPath();
	const history = readMigrationHistory();
	history.push(entry);
	const trimmed = pruneMigrationHistory(history);

	// Ensure data directory exists
	const dataDir = path.dirname(historyPath);
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}

	fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), 'utf8');
}

/** Persist a successful migration to data/migration-history.json. */
export function recordMigrationSuccess(args: {
	contentHash: string;
	durationMs: number;
	migrationTag: string;
	statementCount: number;
}): void {
	appendMigrationHistory({
		contentHash: args.contentHash,
		durationMs: args.durationMs,
		migrationTag: args.migrationTag,
		statementCount: args.statementCount,
		status: 'success',
		timestamp: new Date().toISOString(),
	});
}

/** Persist a failed migration to data/migration-history.json. */
export function recordMigrationFailure(args: {
	durationMs: number;
	error: unknown;
	migrationTag: string;
	statementCount: number;
}): void {
	appendMigrationHistory({
		durationMs: args.durationMs,
		error: args.error instanceof Error ? args.error.message : String(args.error),
		migrationTag: args.migrationTag,
		statementCount: args.statementCount,
		status: 'failed',
		timestamp: new Date().toISOString(),
	});
}
