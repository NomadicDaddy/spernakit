#!/usr/bin/env bun
/**
 * check-schema-parity.ts
 *
 * Compares SQLite schema files (backend/src/db/schema/) against PostgreSQL
 * schema files (backend/src/db/schema-pg/) for structural parity.
 *
 * Checks:
 *   1. Every SQLite schema file has a matching PG schema file (and vice versa)
 *   2. Column names (the database column name string) match between counterparts
 *   3. Index names match between counterparts
 *   4. Enum columns have named database-level domain CHECK constraints
 *
 * Run: bun scripts/check-schema-parity.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SQLITE_DIR = resolve(ROOT, 'backend/src/db/schema');
const PG_DIR = resolve(ROOT, 'backend/src/db/schema-pg');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readText(relPath: string): string {
	return readFileSync(relPath, 'utf8');
}

/** Extract the database column name strings from column definitions like `text('email')` or `integer('id')`. */
function extractColumnNames(source: string): string[] {
	const names: string[] = [];
	// Match column name strings: type('name', ...) — captures the string argument
	for (const m of source.matchAll(
		/\b(?:integer|text|boolean|timestamp|serial|bigint|numeric|real|blob|json|jsonb|doublePrecision|uuid|varchar|char|date|time|decimal|smallint|mediumint|tinyint)\s*\(\s*'([^']+)'/g
	)) {
		const name = m[1]!.trim();
		if (!names.includes(name)) {
			names.push(name);
		}
	}
	return names.sort();
}

/** Extract index names like `index('idx_xxx').on(...)`. */
function extractIndexNames(source: string): string[] {
	const names: string[] = [];
	for (const m of source.matchAll(/index\s*\(\s*'([^']+)'\s*\)/g)) {
		names.push(m[1]!.trim());
	}
	return names.sort();
}

interface EnumColumn {
	columnName: string;
	line: number;
}

interface SchemaTable {
	source: string;
	startLine: number;
	tableName: string;
}

/** Extract text columns that declare a Drizzle enum. */
function extractEnumColumns(source: string, startLine: number): EnumColumn[] {
	const columns: EnumColumn[] = [];
	const enumColumnPattern = /text\s*\(\s*'([^']+)'\s*,\s*\{\s*enum\s*:\s*[^,}]+,?\s*\}\s*\)/g;

	for (const match of source.matchAll(enumColumnPattern)) {
		const columnName = match[1]!;
		const matchIndex = match.index ?? 0;
		const line = startLine + source.slice(0, matchIndex).split('\n').length - 1;
		columns.push({ columnName, line });
	}

	return columns;
}

function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find the matching close parenthesis while skipping strings and comments. */
function findClosingParenthesis(source: string, openingIndex: number): number | undefined {
	let depth = 0;
	let quote: '"' | '`' | "'" | undefined;

	for (let index = openingIndex; index < source.length; index += 1) {
		const character = source[index]!;
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
function extractSchemaTables(source: string): SchemaTable[] {
	const tables: SchemaTable[] = [];
	const tablePattern = /(?:sqliteTable|pgTable)\s*\(\s*'([^']+)'/g;

	for (const match of source.matchAll(tablePattern)) {
		const tableName = match[1]!;
		const tableStart = match.index ?? 0;
		const openingIndex = source.indexOf('(', tableStart);
		const closingIndex = findClosingParenthesis(source, openingIndex);
		if (closingIndex === undefined) continue;
		tables.push({
			source: source.slice(tableStart, closingIndex + 1),
			startLine: source.slice(0, tableStart).split('\n').length,
			tableName,
		});
	}

	return tables;
}

/** Report enum columns that lack their required named domain constraint. */
function checkEnumDomainConstraints(source: string, relativePath: string): string[] {
	const domainErrors: string[] = [];

	for (const table of extractSchemaTables(source)) {
		for (const column of extractEnumColumns(table.source, table.startLine)) {
			const constraintName = `chk_${table.tableName}_${column.columnName}`;
			const pattern = new RegExp(
				`check\\s*\\(\\s*'${escapeRegularExpression(constraintName)}'\\s*,`
			);

			if (!pattern.test(table.source)) {
				domainErrors.push(
					`  ${relativePath}:${column.line}: enum column "${column.columnName}" lacks a named domain CHECK constraint`
				);
			}
		}
	}

	return domainErrors;
}

/** List non-index .ts files in a schema directory. */
function listSchemaFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.ts') && f !== 'index.ts')
		.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const errors: string[] = [];

const sqliteFiles = listSchemaFiles(SQLITE_DIR);
const pgFiles = listSchemaFiles(PG_DIR);

// Check 1: File-level parity
const sqliteSet = new Set(sqliteFiles);
const pgSet = new Set(pgFiles);

for (const file of sqliteFiles) {
	if (!pgSet.has(file)) {
		errors.push(`  SQLite schema "${file}" has no matching PG schema file`);
	}
}

for (const file of pgFiles) {
	if (!sqliteSet.has(file)) {
		errors.push(`  PG schema "${file}" has no matching SQLite schema file`);
	}
}

// Check 2 & 3: Column and index parity for files that exist in both
const commonFiles = sqliteFiles.filter((f) => pgSet.has(f));

for (const file of commonFiles) {
	const sqliteSource = readText(resolve(SQLITE_DIR, file));
	const pgSource = readText(resolve(PG_DIR, file));

	const sqliteColumns = extractColumnNames(sqliteSource);
	const pgColumns = extractColumnNames(pgSource);

	if (sqliteColumns.length !== pgColumns.length) {
		errors.push(
			`  ${file}: column count mismatch (SQLite: ${sqliteColumns.length}, PG: ${pgColumns.length})`
		);
	}

	// Find columns in SQLite but not in PG
	for (const col of sqliteColumns) {
		if (!pgColumns.includes(col)) {
			errors.push(`  ${file}: column "${col}" exists in SQLite but missing from PG`);
		}
	}

	// Find columns in PG but not in SQLite
	for (const col of pgColumns) {
		if (!sqliteColumns.includes(col)) {
			errors.push(`  ${file}: column "${col}" exists in PG but missing from SQLite`);
		}
	}

	const sqliteIndexes = extractIndexNames(sqliteSource);
	const pgIndexes = extractIndexNames(pgSource);

	for (const idx of sqliteIndexes) {
		if (!pgIndexes.includes(idx)) {
			errors.push(`  ${file}: index "${idx}" exists in SQLite but missing from PG`);
		}
	}

	for (const idx of pgIndexes) {
		if (!sqliteIndexes.includes(idx)) {
			errors.push(`  ${file}: index "${idx}" exists in PG but missing from SQLite`);
		}
	}

	errors.push(
		...checkEnumDomainConstraints(sqliteSource, `backend/src/db/schema/${file}`),
		...checkEnumDomainConstraints(pgSource, `backend/src/db/schema-pg/${file}`)
	);
}

if (errors.length > 0) {
	console.error('[FAIL] Schema parity check found issues:');
	for (const line of errors) {
		console.error(line);
	}
	process.exit(1);
}

console.log('[OK] Schema parity check passed.');
