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
}

if (errors.length > 0) {
	console.error('[FAIL] Schema parity check found issues:');
	for (const line of errors) {
		console.error(line);
	}
	process.exit(1);
}

console.log('[OK] Schema parity check passed.');
