#!/usr/bin/env bun
/**
 * check-schema-parity.ts
 *
 * Enforces: ASSERT-013 -- the SQLite and PostgreSQL schema trees remain structurally in lockstep.
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
 * The parsing and the comparisons live in `lib/schema-parity/`; this file reads the two trees and
 * prints what they report.
 *
 * Run: bun scripts/check-schema-parity.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { checkEnumDomainConstraints } from './lib/schema-parity/constraints.ts';
import {
	checkColumnParity,
	checkFileParity,
	checkIndexParity,
} from './lib/schema-parity/parity.ts';

const ROOT = resolve(import.meta.dir, '..');
const SQLITE_DIR = resolve(ROOT, 'backend/src/db/schema');
const PG_DIR = resolve(ROOT, 'backend/src/db/schema-pg');

/** List non-index .ts files in a schema directory. */
function listSchemaFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith('.ts') && file !== 'index.ts')
		.sort();
}

export function runSchemaParity(): number {
	const sqliteFiles = listSchemaFiles(SQLITE_DIR);
	const pgFiles = listSchemaFiles(PG_DIR);
	const errors = checkFileParity(sqliteFiles, pgFiles);

	const pgSet = new Set(pgFiles);
	for (const file of sqliteFiles.filter((name) => pgSet.has(name))) {
		const sqliteSource = readFileSync(resolve(SQLITE_DIR, file), 'utf8');
		const pgSource = readFileSync(resolve(PG_DIR, file), 'utf8');

		errors.push(
			...checkColumnParity(file, sqliteSource, pgSource),
			...checkIndexParity(file, sqliteSource, pgSource),
			...checkEnumDomainConstraints(sqliteSource, `backend/src/db/schema/${file}`),
			...checkEnumDomainConstraints(pgSource, `backend/src/db/schema-pg/${file}`),
		);
	}

	if (errors.length > 0) {
		console.error('[FAIL] Schema parity check found issues:');
		for (const line of errors) {
			console.error(line);
		}
		return 1;
	}

	console.log('[OK] Schema parity check passed.');
	return 0;
}

if (import.meta.main) exit(runSchemaParity());
