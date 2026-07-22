/** Substrings in column names that indicate sensitive data requiring redaction. */
const SENSITIVE_COLUMN_PATTERNS = [
	'access_token',
	'api_key',
	'bearer',
	'credential',
	'csrf_token',
	'encryption_key',
	'jwt_key',
	'key_hash',
	'nonce',
	'password_hash',
	'private_key',
	'refresh_token',
	'refresh_token_hash',
	'secret',
	'token_hash',
] as const;

/** Patterns that match sensitive values regardless of column name. */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
	/^\$2[aby]\$\d{2}\$/, // bcrypt hash
	/^-----BEGIN .+ KEY-----/, // PEM-encoded key
	/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./, // JWT token
];

const REDACTED = '[REDACTED]';

/**
 * Check whether a column name matches a sensitive pattern.
 * @param columnName
 * @returns True if the column name matches a sensitive pattern.
 */
function isSensitiveColumn(columnName: string): boolean {
	const lower = columnName.toLowerCase();
	return SENSITIVE_COLUMN_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Check whether a value matches a known sensitive data pattern.
 * @param value - The value to check.
 * @returns True if the value matches a sensitive pattern.
 */
function isSensitiveValue(value: unknown): boolean {
	if (typeof value !== 'string') return false;
	return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Redact sensitive column values from a single data row.
 * Also masks encrypted settings values (is_encrypted = true → value = '[REDACTED]').
 * @param row
 * @returns Row with sensitive values replaced by '[REDACTED]'.
 */
function redactRow(row: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const isEncryptedRow = row.is_encrypted === 1 || row.is_encrypted === true;

	for (const [key, value] of Object.entries(row)) {
		if (isSensitiveColumn(key) && value !== null) {
			result[key] = REDACTED;
		} else if (key === 'value' && isEncryptedRow && value !== null) {
			result[key] = REDACTED;
		} else if (isSensitiveValue(value)) {
			result[key] = REDACTED;
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Redact sensitive columns from an array of data rows.
 * @param rows
 * @returns Rows with sensitive values replaced by '[REDACTED]'.
 */
function redactSensitiveColumns(rows: Record<string, unknown>[]): Record<string, unknown>[] {
	return rows.map(redactRow);
}

/**
 * Check if any keys in the provided data object target sensitive columns.
 * Prevents writes to authentication/credential columns via the database admin UI.
 *
 * @param keys - Column names being written
 * @returns Array of blocked column names, or empty array if all columns are safe
 */
function getSensitiveWriteColumns(keys: string[]): string[] {
	return keys.filter((key) => isSensitiveColumn(key));
}

export { getSensitiveWriteColumns, redactRow, redactSensitiveColumns };
