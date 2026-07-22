#!/usr/bin/env bun
/**
 * Enforces ASSERT-012: Drizzle foreign keys must use named foreignKey() constraints.
 *
 * Inline .references() creates unnamed foreign keys, so schema migrations cannot rely on
 * stable constraint names across SQLite and PostgreSQL. Scan both schema dialects and report
 * every offending source location for a direct repair.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { exit } from 'node:process';

const ROOT = resolve(import.meta.dir, '..');
const SCHEMA_DIRECTORIES = [
	resolve(ROOT, 'backend/src/db/schema'),
	resolve(ROOT, 'backend/src/db/schema-pg'),
];
const INLINE_REFERENCE = /\.references\s*\(/g;

interface Finding {
	file: string;
	line: number;
}

function collectTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...collectTypeScriptFiles(path));
		else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
	}
	return files;
}

function findInlineReferences(file: string): Finding[] {
	const source = readFileSync(file, 'utf8');
	const findings: Finding[] = [];
	for (const match of source.matchAll(INLINE_REFERENCE)) {
		const line = source.slice(0, match.index).split('\n').length;
		findings.push({
			file: relative(ROOT, file).replaceAll('\\', '/'),
			line,
		});
	}
	return findings;
}

function main(): number {
	const findings = SCHEMA_DIRECTORIES.flatMap((directory) =>
		collectTypeScriptFiles(directory).flatMap(findInlineReferences)
	);

	if (findings.length === 0) {
		console.log('[OK] No inline .references() calls found in Drizzle schema files.');
		return 0;
	}

	console.error('[FAIL] ASSERT-012 forbids inline .references() calls in Drizzle schema files:');
	for (const finding of findings) console.error(`- ${finding.file}:${finding.line}`);
	console.error('Use a named foreignKey({ columns, foreignColumns, name }) constraint instead.');
	return 1;
}

exit(main());
