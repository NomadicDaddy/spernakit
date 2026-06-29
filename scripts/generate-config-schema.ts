#!/usr/bin/env bun
/**
 * Config JSON Schema Generator
 *
 * Generates a JSON Schema from the Zod config schema for editor intellisense.
 * Output: config/config-schema.json
 *
 * Usage:
 *   bun run config:schema
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { appConfigSchema, toJSONSchema } from '../backend/src/config/configSchema.ts';
import { projectRoot } from '../backend/src/config/configUtils.ts';

function main(): void {
	const configDir = join(projectRoot, 'config');
	const outputPath = join(configDir, 'config-schema.json');

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	console.log('Generating JSON Schema from Zod config schema...');

	const jsonSchema = toJSONSchema(appConfigSchema) as Record<string, unknown>;

	// Add metadata
	jsonSchema['$schema'] = 'http://json-schema.org/draft-07/schema#';
	jsonSchema['title'] = 'Spernakit Application Configuration';
	jsonSchema['description'] =
		`Configuration schema for Spernakit v3 applications. Generated from backend Zod schemas via "bun run config:schema".`;

	writeFileSync(outputPath, `${JSON.stringify(jsonSchema, null, '\t')}\n`, 'utf8');

	console.log(`JSON Schema written to: ${outputPath}`);
	console.log(
		'Add "$schema": "./config-schema.json" to your config JSON for VS Code intellisense.'
	);
}

main();
