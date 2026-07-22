/**
 * @security All table/column names MUST be validated against the sqlite_master
 * allowlist before reaching query functions. Direct string interpolation is used
 * because SQLite does not support parameterized PRAGMA/DDL identifiers.
 * Single quotes for PRAGMA args, double quotes for DML identifiers.
 */

import { getRawClient } from './rawClient.ts';
import {
	assertSafeIdentifier,
	fetchColumns,
	fetchForeignKeys,
	fetchIndexes,
	type ColumnInfo,
	type ForeignKeyInfo,
	type IndexInfo,
	type TableDetails,
	type TableMetadata,
} from './schemaMetadata.ts';

/**
 * Tables that must never be mutated through the database admin panel. These are
 * owned by dedicated, audited code paths (auth, API keys, token revocation,
 * audit history); editing them through the raw data editor would bypass those
 * integrity/security invariants. Reads stay allowed via the redaction layer.
 */
const MUTATION_DENIED_TABLES = new Set(['api_keys', 'audit_logs', 'token_blacklist', 'users']);

/**
 * Legacy append-only set. @deprecated Superseded by MUTATION_DENIED_TABLES
 * (which also covers api_keys/token_blacklist/users); retained so
 * scheduled_task_executions remains denied without changing its exclusion.
 */
const IMMUTABLE_TABLES = new Set(['audit_logs', 'scheduled_task_executions']);

/**
 * Check whether a table may be mutated via the database admin panel.
 * @param tableName - The table name to check.
 * @returns False for security-managed and append-only system tables.
 */
function isTableMutable(tableName: string): boolean {
	return !MUTATION_DENIED_TABLES.has(tableName) && !IMMUTABLE_TABLES.has(tableName);
}

/** Cache TTL for allowed table names (60 seconds). */
const TABLE_CACHE_TTL_MS = 60_000;
let cachedTableNames: null | string[] = null;
let tableCacheExpiry = 0;

/**
 * Build a runtime allowlist of user table names from sqlite_master.
 * Excludes SQLite internal tables (sqlite_*) and Drizzle migration tables.
 * @returns Sorted array of allowed table names.
 */
function getAllowedTableNames(): string[] {
	const now = Date.now();
	if (cachedTableNames && now < tableCacheExpiry) {
		return cachedTableNames;
	}
	const raw = getRawClient();
	const rows = raw
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name"
		)
		.all() as { name: string }[];
	cachedTableNames = rows.map((r) => r.name);
	tableCacheExpiry = now + TABLE_CACHE_TTL_MS;
	return cachedTableNames;
}

/**
 * Validate a table name against the runtime allowlist.
 * This is the critical injection defense — only table names from sqlite_master are accepted.
 * @param tableName - The table name to validate.
 * @returns True if the table name exists in the allowlist.
 */
function validateTableName(tableName: string): boolean {
	assertSafeIdentifier(tableName, 'table');
	const allowed = getAllowedTableNames();
	return allowed.includes(tableName);
}

/**
 * Validate that a table name is a real user table AND mutable through the
 * admin data editor. Combines the sqlite_master allowlist with the
 * MUTATION_DENIED_TABLES / IMMUTABLE_TABLES denylist. Reads against denied
 * tables use validateTableName; this gates only insert/update/delete.
 * @param tableName - The table name to validate for mutation.
 * @returns True if the table exists and may be mutated via the admin panel.
 */
function validateMutableTableName(tableName: string): boolean {
	return validateTableName(tableName) && isTableMutable(tableName);
}

/**
 * List all user tables with metadata.
 * @returns Array of table metadata objects.
 */
function listTables(): TableMetadata[] {
	const raw = getRawClient();
	const tableNames = getAllowedTableNames();

	return tableNames.map((tableName) => {
		assertSafeIdentifier(tableName, 'table');
		const columns = raw.prepare(`PRAGMA table_info('${tableName}')`).all() as {
			cid: number;
		}[];

		// Table name is validated against sqlite_master allowlist and assertSafeIdentifier before interpolation
		const countResult = raw.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).all() as {
			cnt: number;
		}[];

		return {
			columnCount: columns.length,
			rowCount: countResult[0]?.cnt ?? 0,
			tableName,
		};
	});
}

/**
 * Get detailed metadata for a specific table.
 *
 * @param tableName - The table name to inspect.
 * @returns Table details or null if table name is invalid.
 */
function getTableDetails(tableName: string): null | TableDetails {
	if (!validateTableName(tableName)) return null;

	const raw = getRawClient();
	return {
		columns: fetchColumns(raw, tableName),
		foreignKeys: fetchForeignKeys(raw, tableName),
		indexes: fetchIndexes(raw, tableName),
		tableName,
	};
}

/**
 * Get all foreign key relationships across all tables for ERD rendering.
 * @returns Array of relationships with source and target table/column info.
 */
function getAllRelationships(): (ForeignKeyInfo & { sourceTable: string })[] {
	const raw = getRawClient();
	const tableNames = getAllowedTableNames();
	const relationships: (ForeignKeyInfo & { sourceTable: string })[] = [];

	for (const tableName of tableNames) {
		assertSafeIdentifier(tableName, 'table');
		const rawFks = raw.prepare(`PRAGMA foreign_key_list('${tableName}')`).all() as {
			from: string;
			id: number;
			seq: number;
			table: string;
			to: string;
		}[];

		for (const fk of rawFks) {
			relationships.push({
				sourceColumn: fk.from,
				sourceTable: tableName,
				targetColumn: fk.to,
				targetTable: fk.table,
			});
		}
	}

	return relationships;
}

export type { ColumnInfo, ForeignKeyInfo, IndexInfo, TableDetails, TableMetadata };
export {
	assertSafeIdentifier,
	getAllRelationships,
	getTableDetails,
	isTableMutable,
	listTables,
	MUTATION_DENIED_TABLES,
	validateMutableTableName,
	validateTableName,
};
