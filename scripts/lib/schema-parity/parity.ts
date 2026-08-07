/**
 * The comparisons themselves. Every function takes source text and returns the mismatches it found,
 * so each one is checkable on its own without a schema tree on disk.
 */

import { extractColumnNames, extractIndexNames } from './extract.ts';

/** Report schema files present in one tree and absent from the other. */
export function checkFileParity(sqliteFiles: string[], pgFiles: string[]): string[] {
	const errors: string[] = [];
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

	return errors;
}

/** Report column-name differences between a SQLite schema file and its PG counterpart. */
export function checkColumnParity(file: string, sqliteSource: string, pgSource: string): string[] {
	const errors: string[] = [];
	const sqliteColumns = extractColumnNames(sqliteSource);
	const pgColumns = extractColumnNames(pgSource);

	// Reported separately from the per-column differences below: a count mismatch with no missing
	// name means a duplicate declaration, which the name comparison alone cannot show.
	if (sqliteColumns.length !== pgColumns.length) {
		errors.push(
			`  ${file}: column count mismatch (SQLite: ${sqliteColumns.length}, PG: ${pgColumns.length})`,
		);
	}

	for (const column of sqliteColumns) {
		if (!pgColumns.includes(column)) {
			errors.push(`  ${file}: column "${column}" exists in SQLite but missing from PG`);
		}
	}

	for (const column of pgColumns) {
		if (!sqliteColumns.includes(column)) {
			errors.push(`  ${file}: column "${column}" exists in PG but missing from SQLite`);
		}
	}

	return errors;
}

/** Report index-name differences between a SQLite schema file and its PG counterpart. */
export function checkIndexParity(file: string, sqliteSource: string, pgSource: string): string[] {
	const errors: string[] = [];
	const sqliteIndexes = extractIndexNames(sqliteSource);
	const pgIndexes = extractIndexNames(pgSource);

	for (const index of sqliteIndexes) {
		if (!pgIndexes.includes(index)) {
			errors.push(`  ${file}: index "${index}" exists in SQLite but missing from PG`);
		}
	}

	for (const index of pgIndexes) {
		if (!sqliteIndexes.includes(index)) {
			errors.push(`  ${file}: index "${index}" exists in PG but missing from SQLite`);
		}
	}

	return errors;
}
