#!/usr/bin/env bun
/**
 * Database Location Guard (ASSERT-010)
 *
 * Resolves the effective database file path from each config layer and asserts
 * it is contained within the project-root `data/` directory. Without this gate
 * a misconfigured `database.url`/path could silently recreate the historical
 * `backend/data/` drift without failing any check — the invariant was
 * previously documented as policy-only in `.aidd/assertions.md`.
 *
 * Covers the live instance config, `config/example.json`, and
 * `backend/src/config/defaults.json`, for both the SQLite file path and a
 * PostgreSQL local-socket/path config (remote Postgres connections have no
 * app-managed local file and pass).
 *
 * Usage:
 *   bun scripts/check-db-location.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	deepMerge,
	getAppSlug,
	loadDefaults,
	projectRoot,
} from '../backend/src/config/configUtils.ts';
import {
	assertDbUnderDataDir,
	type DatabaseLocationConfig,
} from '../backend/src/config/databaseLocation.ts';

function readJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	} catch (err) {
		throw new Error(
			`Failed to parse config at ${path}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}
}

function getDatabaseConfig(merged: Record<string, unknown>): DatabaseLocationConfig {
	const database = (merged['database'] ?? {}) as Record<string, unknown>;
	const dialect = typeof database['dialect'] === 'string' ? database['dialect'] : 'sqlite';
	const url = typeof database['url'] === 'string' ? database['url'] : '';
	return { dialect, url };
}

interface Target {
	database: DatabaseLocationConfig;
	label: string;
}

function buildTargets(): Target[] {
	const defaults = loadDefaults();
	const slug = getAppSlug(defaults);
	const targets: Target[] = [];

	const instancePath = join(projectRoot, 'config', `${slug}.json`);
	if (existsSync(instancePath)) {
		targets.push({
			database: getDatabaseConfig(deepMerge(defaults, readJson(instancePath))),
			label: `config/${slug}.json`,
		});
	}

	const examplePath = join(projectRoot, 'config', 'example.json');
	if (existsSync(examplePath)) {
		targets.push({
			database: getDatabaseConfig(deepMerge(defaults, readJson(examplePath))),
			label: 'config/example.json',
		});
	}

	targets.push({
		database: getDatabaseConfig(defaults),
		label: 'backend/src/config/defaults.json',
	});

	return targets;
}

function main(): void {
	const failures: string[] = [];

	for (const target of buildTargets()) {
		const result = assertDbUnderDataDir(target.database, projectRoot);
		if (result.ok) {
			const where = result.resolvedPath ?? '(no local DB file — in-memory or remote)';
			console.log(`[OK] ${target.label}: ${where}`);
		} else {
			failures.push(`${target.label}: ${result.message}`);
		}
	}

	if (failures.length > 0) {
		console.error('[FAIL] Database location guard (ASSERT-010) violated:');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		process.exit(1);
	}

	console.log('[OK] Database location guard (ASSERT-010) passed.');
}

main();
