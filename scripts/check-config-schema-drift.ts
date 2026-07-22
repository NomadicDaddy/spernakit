#!/usr/bin/env bun
/**
 * Config Schema Artifact Drift Check
 *
 * Regenerates the JSON schema from the TypeBox source in-memory and diffs it
 * against the committed `config/config-schema.json`. Fails if the committed
 * artifact is stale, instructing the developer to run `bun run config:schema`.
 *
 * Without this check, the TypeBox source can evolve (new fields, new constraints)
 * and the committed artifact silently lags behind — exactly what happened in
 * the March/April stale-schema drift sweep: the schema had `busyTimeoutMs` and
 * `authEnabled`, but `config-schema.json` in five derived apps did not.
 *
 * Usage:
 *   bun scripts/check-config-schema-drift.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getConfigJsonSchema } from '../backend/src/config/configSchema.ts';
import { projectRoot } from '../backend/src/config/configUtils.ts';

const configDir = join(projectRoot, 'config');
const schemaPath = join(configDir, 'config-schema.json');

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalize(item));
	}

	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			result[key] = canonicalize(record[key]);
		}
		return result;
	}

	return value;
}

function buildExpectedSchema(): Record<string, unknown> {
	const jsonSchema = getConfigJsonSchema();
	jsonSchema['$schema'] = 'http://json-schema.org/draft-07/schema#';
	jsonSchema['title'] = 'Spernakit Application Configuration';
	jsonSchema['description'] =
		`Configuration schema for Spernakit v3 applications. Generated from backend TypeBox schemas via "bun run config:schema".`;
	return jsonSchema;
}

function main(): void {
	if (!existsSync(schemaPath)) {
		console.error(
			`[FAIL] Schema artifact missing: ${schemaPath}\n` +
				'       Run `bun run config:schema` to generate it.'
		);
		process.exit(1);
	}

	const committed = JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
	const expected = buildExpectedSchema();

	if (JSON.stringify(canonicalize(committed)) === JSON.stringify(canonicalize(expected))) {
		console.log('[OK] Config schema artifact is in sync with TypeBox source.');
		process.exit(0);
	}

	console.error(
		'[FAIL] Config schema artifact is out of sync with TypeBox source.\n' +
			`       File: ${schemaPath}\n` +
			'       TypeBox source files under backend/src/config/configSchemas/ have\n' +
			'       changed since the committed schema was generated.\n\n' +
			'       Fix: bun run config:schema\n'
	);
	process.exit(1);
}

main();
