/**
 * Source-text extraction for the schema-parity gate: the Drizzle declarations are read as text
 * rather than imported, because importing `schema-pg/` would require a live PostgreSQL driver in a
 * gate that runs on every commit.
 */

import type { EnumColumn, SchemaTable } from './types.ts';

const COLUMN_TYPES = [
	'integer',
	'text',
	'boolean',
	'timestamp',
	'serial',
	'bigint',
	'numeric',
	'real',
	'blob',
	'json',
	'jsonb',
	'doublePrecision',
	'uuid',
	'varchar',
	'char',
	'date',
	'time',
	'decimal',
	'smallint',
	'mediumint',
	'tinyint',
].join('|');

/**
 * Extract the database column name strings from column definitions like `text('email')` or
 * `integer('id')`. The declaration name is deliberately ignored: parity is about the names the
 * database sees, and the two trees are free to bind them to different identifiers.
 */
export function extractColumnNames(source: string): string[] {
	const names: string[] = [];
	const pattern = new RegExp(String.raw`\b(?:${COLUMN_TYPES})\s*\(\s*'([^']+)'`, 'g');

	for (const match of source.matchAll(pattern)) {
		const name = (match[1] ?? '').trim();
		if (!names.includes(name)) names.push(name);
	}

	return names.sort();
}

/** Extract index names like `index('idx_xxx').on(...)`. */
export function extractIndexNames(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(/index\s*\(\s*'([^']+)'\s*\)/g)) {
		names.push((match[1] ?? '').trim());
	}
	return names.sort();
}

/** Extract text columns that declare a Drizzle enum. */
export function extractEnumColumns(source: string, startLine: number): EnumColumn[] {
	const columns: EnumColumn[] = [];
	const enumColumnPattern = /text\s*\(\s*'([^']+)'\s*,\s*\{\s*enum\s*:\s*[^,}]+,?\s*\}\s*\)/g;

	for (const match of source.matchAll(enumColumnPattern)) {
		const matchIndex = match.index ?? 0;
		columns.push({
			columnName: match[1] ?? '',
			line: startLine + source.slice(0, matchIndex).split('\n').length - 1,
		});
	}

	return columns;
}

/** Find the matching close parenthesis while skipping strings and comments. */
function findClosingParenthesis(source: string, openingIndex: number): number | undefined {
	let depth = 0;
	let quote: '"' | '`' | "'" | undefined;

	for (let index = openingIndex; index < source.length; index += 1) {
		const character = source[index] ?? '';
		const nextCharacter = source[index + 1];

		if (quote) {
			if (character === '\\') {
				index += 1;
			} else if (character === quote) {
				quote = undefined;
			}
			continue;
		}

		if (character === '/' && nextCharacter === '/') {
			const newlineIndex = source.indexOf('\n', index + 2);
			index = newlineIndex === -1 ? source.length : newlineIndex;
			continue;
		}
		if (character === '/' && nextCharacter === '*') {
			const commentEnd = source.indexOf('*/', index + 2);
			index = commentEnd === -1 ? source.length : commentEnd + 1;
			continue;
		}
		if (character === '"' || character === "'" || character === '`') {
			quote = character;
			continue;
		}
		if (character === '(') depth += 1;
		if (character === ')') depth -= 1;
		if (depth === 0) return index;
	}

	return undefined;
}

/** Extract each individual SQLite or PostgreSQL table declaration. */
export function extractSchemaTables(source: string): SchemaTable[] {
	const tables: SchemaTable[] = [];
	const tablePattern = /(?:sqliteTable|pgTable)\s*\(\s*'([^']+)'/g;

	for (const match of source.matchAll(tablePattern)) {
		const tableStart = match.index ?? 0;
		const openingIndex = source.indexOf('(', tableStart);
		const closingIndex = findClosingParenthesis(source, openingIndex);
		if (closingIndex === undefined) continue;
		tables.push({
			source: source.slice(tableStart, closingIndex + 1),
			startLine: source.slice(0, tableStart).split('\n').length,
			tableName: match[1] ?? '',
		});
	}

	return tables;
}
