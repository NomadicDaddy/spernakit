/**
 * @security All table/column names MUST be validated against the sqlite_master
 * allowlist before reaching query functions. Direct string interpolation is used
 * because SQLite does not support parameterized PRAGMA/DDL identifiers.
 * Single quotes for PRAGMA args, double quotes for DML identifiers.
 */

import { getRawClient } from './rawClient.ts';

/** Pattern for valid SQLite identifier names. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Tables that must never be mutated through the database admin panel.
 * Audit logs and task execution history are append-only system records;
 * allowing edits would defeat their tamper-evidence purpose. Reads stay allowed.
 */
const IMMUTABLE_TABLES = new Set(['audit_logs', 'scheduled_task_executions']);

/**
 * Check whether a table may be mutated via the database admin panel.
 * @param tableName - The table name to check.
 * @returns False for append-only system tables (audit logs, task executions).
 */
function isTableMutable(tableName: string): boolean {
	return !IMMUTABLE_TABLES.has(tableName);
}

/** Cache TTL for allowed table names (60 seconds). */
const TABLE_CACHE_TTL_MS = 60_000;
let cachedTableNames: null | string[] = null;
let tableCacheExpiry = 0;

/**
 * Assert that an identifier is safe for SQL interpolation.
 * This is a last-line-of-defense check — callers should also validate via allowlist.
 * @param name - The identifier to check.
 * @param label - Label for the error message (e.g., 'table', 'column').
 */
function assertSafeIdentifier(name: string, label: string): void {
	if (!SAFE_IDENTIFIER.test(name)) {
		throw new Error(`Unsafe ${label} name rejected: ${name}`);
	}
}

/** Metadata for a database table. */
interface TableMetadata {
	columnCount: number;
	rowCount: number;
	tableName: string;
}

/** Column information from PRAGMA table_info(). */
interface ColumnInfo {
	defaultValue: null | string;
	isPrimaryKey: boolean;
	name: string;
	notnull: boolean;
	type: string;
}

/** Foreign key information from PRAGMA foreign_key_list(). */
interface ForeignKeyInfo {
	sourceColumn: string;
	targetColumn: string;
	targetTable: string;
}

/** Index information from PRAGMA index_list() + index_info(). */
interface IndexInfo {
	columns: string[];
	indexName: string;
	isUnique: boolean;
}

/** Detailed table metadata including columns, foreign keys, and indexes. */
interface TableDetails {
	columns: ColumnInfo[];
	foreignKeys: ForeignKeyInfo[];
	indexes: IndexInfo[];
	tableName: string;
}

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

/** Raw SQLite client type extracted for PRAGMA query helpers. */
type RawClient = ReturnType<typeof getRawClient>;

function fetchColumns(raw: RawClient, tableName: string): ColumnInfo[] {
	const rawColumns = raw.prepare(`PRAGMA table_info('${tableName}')`).all() as {
		cid: number;
		dflt_value: null | string;
		name: string;
		notnull: number;
		pk: number;
		type: string;
	}[];

	return rawColumns.map((col) => ({
		defaultValue: col.dflt_value,
		isPrimaryKey: col.pk > 0,
		name: col.name,
		notnull: col.notnull === 1,
		type: col.type,
	}));
}

function fetchForeignKeys(raw: RawClient, tableName: string): ForeignKeyInfo[] {
	const rawFks = raw.prepare(`PRAGMA foreign_key_list('${tableName}')`).all() as {
		from: string;
		id: number;
		seq: number;
		table: string;
		to: string;
	}[];

	return rawFks.map((fk) => ({
		sourceColumn: fk.from,
		targetColumn: fk.to,
		targetTable: fk.table,
	}));
}

function fetchIndexes(raw: RawClient, tableName: string): IndexInfo[] {
	const rawIndexes = raw.prepare(`PRAGMA index_list('${tableName}')`).all() as {
		name: string;
		origin: string;
		partial: number;
		seq: number;
		unique: number;
	}[];

	return rawIndexes.map((idx) => {
		assertSafeIdentifier(idx.name, 'index');
		const indexColumns = raw.prepare(`PRAGMA index_info('${idx.name}')`).all() as {
			cid: number;
			name: string;
			seqno: number;
		}[];

		return {
			columns: indexColumns.map((c) => c.name),
			indexName: idx.name,
			isUnique: idx.unique === 1,
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
	validateTableName,
};
