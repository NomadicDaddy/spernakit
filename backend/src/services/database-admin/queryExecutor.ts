import { getReadOnlyClient } from './rawClient.ts';
import { redactSensitiveColumns } from './redaction.ts';

/** Result of a query execution. */
interface QueryResult {
	columns: string[];
	rowCount: number;
	rows: Record<string, unknown>[];
}

/** Keywords that indicate a mutating or dangerous SQL statement. */
const BLOCKED_KEYWORDS = [
	'INSERT',
	'UPDATE',
	'DELETE',
	'TRUNCATE',
	'DROP',
	'ALTER',
	'GRANT',
	'REVOKE',
	'CREATE',
	'PRAGMA',
	'ATTACH',
	'DETACH',
	'VACUUM',
	'REINDEX',
	'REPLACE',
	'LOAD_EXTENSION',
	'READFILE',
	'WRITEFILE',
	'FTS3_TOKENIZER',
] as const;

/** Pre-compiled pattern matching any blocked SQL keyword. */
const BLOCKED_KEYWORD_PATTERN = new RegExp(`\\b(?:${BLOCKED_KEYWORDS.join('|')})\\b`);

/** Maximum number of rows returned from a query. */
const MAX_QUERY_ROWS = 1000;

/**
 * Strip SQL comments to prevent keyword check bypass.
 * Removes line comments and block comments.
 *
 * @param sql - Raw SQL string
 * @returns SQL with comments removed
 */
function stripSqlComments(sql: string): string {
	return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Replace string literal contents with empty strings to prevent
 * blocked keywords inside quotes from causing false rejections.
 *
 * @param sql - SQL string (comments already stripped)
 * @returns SQL with string literal contents replaced
 */
function stripStringLiterals(sql: string): string {
	return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Validate SQL input for read-only execution.
 * Returns null if valid, or an error message string if invalid.
 *
 * @param trimmed - Trimmed SQL input
 * @param withoutTrailingSemicolon - SQL with trailing semicolon removed
 * @returns Error message or null if valid
 */
function validateSqlInput(trimmed: string, withoutTrailingSemicolon: string): null | string {
	if (!trimmed) return 'SQL query cannot be empty';
	if (withoutTrailingSemicolon.includes(';')) return 'Only single SQL statements are allowed';
	if (!/^SELECT\b/i.test(trimmed)) return 'Only SELECT queries are allowed';

	const strippedSql = stripStringLiterals(stripSqlComments(trimmed)).toUpperCase();
	const blockedMatch = BLOCKED_KEYWORD_PATTERN.exec(strippedSql);
	if (blockedMatch) return `Blocked keyword detected: ${blockedMatch[0]}`;

	return null;
}

/**
 * Execute a read-only SELECT query.
 * Validates that the input is a single SELECT statement and rejects mutating operations.
 *
 * @param sqlInput - Raw SQL input from the user
 * @returns Query result with columns, rows, and row count, or an error message string.
 */
type QueryExecutionResult =
	{ data: QueryResult; success: true } | { error: string; success: false };

function executeReadOnlyQuery(sqlInput: string): QueryExecutionResult {
	const trimmed = sqlInput.trim();
	const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');

	const validationError = validateSqlInput(trimmed, withoutTrailingSemicolon);
	if (validationError) return { error: validationError, success: false };

	const strippedSql = stripSqlComments(trimmed).toUpperCase();
	const hasLimit = /\bLIMIT\s+\d+/i.test(strippedSql);
	const boundedSql = hasLimit ? trimmed : `${withoutTrailingSemicolon} LIMIT ${MAX_QUERY_ROWS}`;

	// Use a dedicated read-only connection to avoid toggling PRAGMA query_only
	// on the shared application connection (which would affect concurrent requests).
	const readOnly = getReadOnlyClient();

	try {
		const rows = readOnly.prepare(boundedSql).all() as Record<string, unknown>[];
		const firstRow = rows[0];
		const columns = firstRow ? Object.keys(firstRow) : [];
		const redactedRows = redactSensitiveColumns(rows);

		return {
			data: { columns, rowCount: redactedRows.length, rows: redactedRows },
			success: true,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Query execution failed';
		const syntaxMatch = /near ".*?"/.exec(message);
		const error = syntaxMatch ? `Query error: ${syntaxMatch[0]}` : 'Query execution failed';
		return { error, success: false };
	}
}

export type { QueryResult };
export { executeReadOnlyQuery };
