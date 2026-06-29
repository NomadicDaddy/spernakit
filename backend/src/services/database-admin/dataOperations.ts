/**
 * @security All table/column names MUST be validated against the sqlite_master
 * allowlist before reaching query functions. Direct string interpolation is used
 * because SQLite does not support parameterized PRAGMA/DDL identifiers.
 * Single quotes for PRAGMA args, double quotes for DML identifiers.
 */

import type { PaginatedResponse } from '../../utils/apiResponse.ts';

import { paginatedQuery } from '../../utils/dbHelpers.ts';
import { getRawClient } from './rawClient.ts';
import { getSensitiveWriteColumns, redactRow, redactSensitiveColumns } from './redaction.ts';
import { assertSafeIdentifier, isTableMutable, validateTableName } from './schemaIntrospection.ts';

/**
 * Column names declared with Drizzle `mode: 'json'` (e.g., audit_logs.details,
 * notifications.metadata, workspaces.settings). Raw edits to these columns must
 * be valid JSON or Drizzle's JSON.parse on read would break the owning feature.
 */
const JSON_COLUMN_NAMES = new Set([
	'details',
	'metadata',
	'options',
	'preferences',
	'profile',
	'result',
	'settings',
]);

/**
 * Assert that a table may be mutated via the admin panel.
 * @param tableName - Target table name (must be pre-validated).
 * @throws Error for append-only system tables (audit_logs, scheduled_task_executions).
 */
function assertTableMutable(tableName: string): void {
	if (!isTableMutable(tableName)) {
		throw new Error(`Table "${tableName}" is read-only and cannot be modified`);
	}
}

/**
 * Get valid column names for a table via PRAGMA table_info().
 * Used to validate user-supplied column names before interpolation into SQL.
 * @param tableName - Table name (must be pre-validated).
 * @returns Set of valid column names.
 */
function getValidColumnNames(tableName: string): Set<string> {
	const raw = getRawClient();
	const columns = raw.prepare(`PRAGMA table_info('${tableName}')`).all() as { name: string }[];
	return new Set(columns.map((c) => c.name));
}

/**
 * Validate that all provided keys are actual column names for the given table.
 * Prevents SQL injection through column name manipulation.
 * @param tableName
 * @param keys
 * @throws Error if any key is not a valid column name.
 */
function validateColumnNames(tableName: string, keys: string[]): void {
	for (const key of keys) {
		assertSafeIdentifier(key, 'column');
	}
	const validColumns = getValidColumnNames(tableName);
	const invalidKeys = keys.filter((k) => !validColumns.has(k));
	if (invalidKeys.length > 0) {
		throw new Error(`Invalid column names: ${invalidKeys.join(', ')}`);
	}
}

/** A single data row returned from queries. */
type DataRow = Record<string, unknown>;

/**
 * Validate that all values in a row are SQLite-compatible primitives.
 * Rejects objects, arrays, booleans, and other complex types.
 *
 * @param values - Row values to validate
 */
function validateRowValues(values: DataRow): void {
	for (const [key, val] of Object.entries(values)) {
		if (val !== null && typeof val !== 'number' && typeof val !== 'string') {
			throw new Error(
				`Invalid value type for column "${key}": expected null, number, or string, got ${typeof val}`
			);
		}
		if (JSON_COLUMN_NAMES.has(key) && typeof val === 'string') {
			try {
				JSON.parse(val);
			} catch {
				throw new Error(`Invalid value for JSON column "${key}": must be valid JSON`);
			}
		}
	}
}

interface GetDataParams {
	includeDeleted?: boolean;
	limit?: number;
	page?: number;
	tableName: string;
}

/**
 * Retrieve paginated data from a table.
 * @param params - Query parameters including table name, pagination, and filters.
 * @returns Paginated result or null if table name is invalid.
 */
function getTableData(params: GetDataParams): null | PaginatedResponse<DataRow> {
	if (!validateTableName(params.tableName)) {
		return null;
	}

	const raw = getRawClient();

	// Check if table has is_deleted column for soft-delete filtering
	const columns = raw.prepare(`PRAGMA table_info('${params.tableName}')`).all() as {
		name: string;
	}[];
	const hasIsDeleted = columns.some((c) => c.name === 'is_deleted');

	let whereClause = '';
	if (hasIsDeleted && !params.includeDeleted) {
		whereClause = 'WHERE is_deleted = 0';
	}

	// Table name validated against allowlist; limit/offset are numbers
	return paginatedQuery(
		params.page,
		params.limit,
		(limitNum, offset) => {
			const rows = raw
				.prepare(
					`SELECT * FROM "${params.tableName}" ${whereClause} LIMIT ${limitNum} OFFSET ${offset}`
				)
				.all() as DataRow[];
			return redactSensitiveColumns(rows);
		},
		() => {
			const result = raw
				.prepare(`SELECT COUNT(*) as count FROM "${params.tableName}" ${whereClause}`)
				.get() as { count: number } | undefined;
			return result;
		}
	);
}

interface InsertResult {
	newValues: DataRow;
	rowId: number;
}

/**
 * Insert a new row into a table.
 * @param tableName - Target table name (validated against allowlist).
 * @param values - Column name to value mapping for the new row.
 * @returns Inserted row data with ID, or null if table is invalid.
 */
function insertRow(tableName: string, values: DataRow): InsertResult | null {
	if (!validateTableName(tableName)) {
		return null;
	}
	assertTableMutable(tableName);

	const raw = getRawClient();
	const keys = Object.keys(values);
	validateColumnNames(tableName, keys);

	const blockedColumns = getSensitiveWriteColumns(keys);
	if (blockedColumns.length > 0) {
		throw new Error(`Cannot write to sensitive columns: ${blockedColumns.join(', ')}`);
	}

	validateRowValues(values);

	const placeholders = keys.map(() => '?').join(', ');
	const columnList = keys.map((k) => `"${k}"`).join(', ');
	const params = keys.map((k) => values[k] as null | number | string);

	// Table name validated via allowlist; values are parameterized
	const stmt = raw.prepare(
		`INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders}) RETURNING *`
	);
	const insertedRow = stmt.get(...params) as DataRow | null;

	if (!insertedRow) {
		return null;
	}

	return { newValues: redactRow(insertedRow), rowId: insertedRow.id as number };
}

interface UpdateResult {
	newValues: DataRow;
	oldValues: DataRow;
}

/**
 * Update a row by its primary key ID.
 * @param tableName - Target table name (validated against allowlist).
 * @param rowId - Primary key ID of the row to update.
 * @param values - Column name to value mapping for updates.
 * @returns Old and new values for audit logging, or null if not found.
 */
function updateRow(tableName: string, rowId: number, values: DataRow): null | UpdateResult {
	if (!validateTableName(tableName)) {
		return null;
	}
	assertTableMutable(tableName);

	const raw = getRawClient();
	const keys = Object.keys(values);
	validateColumnNames(tableName, keys);

	const blockedColumns = getSensitiveWriteColumns(keys);
	if (blockedColumns.length > 0) {
		throw new Error(`Cannot write to sensitive columns: ${blockedColumns.join(', ')}`);
	}

	validateRowValues(values);

	const txn = raw.transaction(() => {
		// Capture old values for audit logging
		const oldValues = raw
			.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`)
			.get(rowId) as DataRow | null;

		if (!oldValues) {
			return null;
		}

		const setClause = keys.map((k) => `"${k}" = ?`).join(', ');
		const params = [...keys.map((k) => values[k] as null | number | string), rowId];

		// Table name validated via allowlist; values are parameterized
		raw.prepare(`UPDATE "${tableName}" SET ${setClause} WHERE id = ?`).run(...params);

		// Capture new values
		const newValues =
			(raw.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(rowId) as DataRow) ?? {};

		return { newValues: redactRow(newValues), oldValues: redactRow(oldValues) };
	});

	return txn();
}

interface DeleteResult {
	deletedValues: DataRow;
	softDeleted: boolean;
}

/**
 * Delete a row by primary key. Soft-deletes if table has is_deleted column, hard-deletes otherwise.
 * @param tableName - Target table name (validated against allowlist).
 * @param rowId - Primary key ID of the row to delete.
 * @returns Deleted values and deletion type, or null if not found.
 */
function deleteRow(tableName: string, rowId: number): DeleteResult | null {
	if (!validateTableName(tableName)) {
		return null;
	}
	assertTableMutable(tableName);

	const raw = getRawClient();

	const txn = raw.transaction(() => {
		// Capture values before deletion for audit
		const deletedValues = raw
			.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`)
			.get(rowId) as DataRow | null;

		if (!deletedValues) {
			return null;
		}

		// Check if table has is_deleted column
		const columns = raw.prepare(`PRAGMA table_info('${tableName}')`).all() as {
			name: string;
		}[];
		const hasIsDeleted = columns.some((c) => c.name === 'is_deleted');

		const redacted = redactRow(deletedValues);

		if (hasIsDeleted) {
			raw.prepare(`UPDATE "${tableName}" SET is_deleted = 1 WHERE id = ?`).run(rowId);
			return { deletedValues: redacted, softDeleted: true };
		}

		raw.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(rowId);
		return { deletedValues: redacted, softDeleted: false };
	});

	return txn();
}

export type { DataRow, DeleteResult, InsertResult, UpdateResult };
export { deleteRow, getTableData, insertRow, updateRow };
