import { downloadBlob } from './download';

/** Safely convert an unknown value to string, handling objects with JSON.stringify. */
function stringifyValue(val: unknown): string {
	if (val === null || val === undefined) return '';
	if (typeof val === 'object') return JSON.stringify(val);
	if (typeof val === 'string') return val;
	if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
		return String(val);
	}
	return JSON.stringify(val) ?? '';
}

/** Characters that trigger formula interpretation in spreadsheet applications. */
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Escape a CSV cell value, quoting if it contains commas, quotes, or newlines. */
function escapeCsvCell(val: unknown): string {
	if (val === null || val === undefined) return '';
	let str = stringifyValue(val);
	if (str.length > 0 && FORMULA_PREFIXES.has(str.charAt(0))) {
		str = `'${str}`;
	}
	return str.includes(',') || str.includes('"') || str.includes('\n')
		? `"${str.replace(/"/g, '""')}"`
		: str;
}

/**
 * Export table data as CSV or JSON, triggering a browser download.
 *
 * @param rows - Array of row objects
 * @param columns - Column names for CSV header ordering
 * @param name - Base filename (without extension)
 * @param format - Export format: 'csv' or 'json'
 */
function exportTableData(
	rows: Record<string, unknown>[],
	columns: string[],
	name: string,
	format: 'csv' | 'json'
): void {
	if (rows.length === 0) return;

	if (format === 'json') {
		const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
		downloadBlob(blob, `${name}.json`);
		return;
	}

	const headers = columns.join(',');
	const csvRows = rows.map((row) => columns.map((col) => escapeCsvCell(row[col])).join(','));
	const blob = new Blob([[headers, ...csvRows].join('\n')], { type: 'text/csv' });
	downloadBlob(blob, `${name}.csv`);
}

export { exportTableData, stringifyValue };
