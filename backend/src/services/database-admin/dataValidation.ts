/**
 * @security All table/column names MUST be validated against the sqlite_master
 * allowlist before reaching query functions. Direct string interpolation is used
 * because SQLite does not support parameterized PRAGMA/DDL identifiers.
 * Single quotes for PRAGMA args, double quotes for DML identifiers.
 */

import { getRawClient } from './rawClient.ts';
import { assertSafeIdentifier, isTableMutable } from './schemaIntrospection.ts';

/**
 * Column names declared with Drizzle `mode: 'json'` (e.g., audit_logs.details,
 * notifications.metadata, workspaces.settings). Raw edits to these columns must
 * be valid JSON or Drizzle's JSON.parse on read would break the owning feature.
 */
export const JSON_COLUMN_NAMES = new Set([
	'details',
	'metadata',
	'options',
	'preferences',
	'profile',
	'result',
	'settings',
]);

/** A single data row returned from queries. */
export type DataRow = Record<string, unknown>;

/**
 * Assert that a table may be mutated via the admin panel.
 * @param tableName - Target table name (must be pre-validated).
 * @throws Error for append-only system tables (audit_logs, scheduled_task_executions).
 */
export function assertTableMutable(tableName: string): void {
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
export function getValidColumnNames(tableName: string): Set<string> {
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
export function validateColumnNames(tableName: string, keys: string[]): void {
	for (const key of keys) {
		assertSafeIdentifier(key, 'column');
	}
	const validColumns = getValidColumnNames(tableName);
	const invalidKeys = keys.filter((k) => !validColumns.has(k));
	if (invalidKeys.length > 0) {
		throw new Error(`Invalid column names: ${invalidKeys.join(', ')}`);
	}
}

/**
 * Validate that all values in a row are SQLite-compatible primitives.
 * Rejects objects, arrays, booleans, and other complex types.
 *
 * @param values - Row values to validate
 */
export function validateRowValues(values: DataRow): void {
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
