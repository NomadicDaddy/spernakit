#!/usr/bin/env bun
/**
 * LTS surface guard.
 *
 * Diffs the current public surface (config schema, template manifest, env shape)
 * against the v3.13.0-lts baselines snapshotted in docs/lts-baseline/. Any drift
 * means the LTS contract has been broken — either revert the change or cut a successor line.
 *
 * Heavy checks (OpenAPI, DB schema) are intentionally not run here: they require
 * loading the app or a populated DB. Run those manually before tagging via
 *   bun scripts/extract-openapi-baseline.ts
 *   bun --cwd backend db:dump-schema
 * and re-diff against the baseline snapshots when releasing a v3.13.x patch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appConfigSchema, toJSONSchema } from '../backend/src/config/configSchema.ts';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const baselineDir = join(repoRoot, 'docs', 'lts-baseline');

interface SurfaceCheck {
	detail: string;
	name: string;
	passed: boolean;
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, 'utf-8'));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			sorted[key] = canonicalize(obj[key]);
		}
		return sorted;
	}
	return value;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function checkTemplateManifest(): SurfaceCheck {
	const live = canonicalJson(readJson(join(repoRoot, 'scripts', 'template-manifest.json')));
	const baseline = canonicalJson(readJson(join(baselineDir, 'template-manifest.json')));
	const passed = live === baseline;
	return {
		detail: passed
			? 'identical to v3.13.0-lts baseline'
			: 'drift detected — manifest changed since LTS tag',
		name: 'template-manifest',
		passed,
	};
}

function checkConfigSchema(): SurfaceCheck {
	// Generate the schema in memory instead of shelling out to
	// scripts/generate-config-schema.ts, which rewrites config/config-schema.json
	// on disk — a check must never mutate the working tree. The metadata fields
	// below mirror generate-config-schema.ts; keep them in sync.
	const liveSchema = toJSONSchema(appConfigSchema) as Record<string, unknown>;
	liveSchema['$schema'] = 'http://json-schema.org/draft-07/schema#';
	liveSchema['title'] = 'Spernakit Application Configuration';
	liveSchema['description'] =
		`Configuration schema for Spernakit v3 applications. Generated from backend Zod schemas via "bun run config:schema".`;

	const live = canonicalJson(liveSchema);
	const baseline = canonicalJson(readJson(join(baselineDir, 'config-schema.json')));
	const passed = live === baseline;
	return {
		detail: passed
			? 'identical to v3.13.0-lts baseline'
			: 'drift detected — config Zod schema changed since LTS tag; run "bun run config:schema" to inspect the regenerated artifact',
		name: 'config-schema',
		passed,
	};
}

interface EnvShape {
	allowedFiles: string[];
	directReads: string[];
	templatedReads: {
		nestedKeys: string[];
		prefixPattern: string;
		securityKeys: string[];
	};
}

function extractEnvShape(): EnvShape {
	const secretsPath = join(repoRoot, 'backend', 'src', 'config', 'configSecrets.ts');
	const src = readFileSync(secretsPath, 'utf-8');

	const securityKeys = extractKeyArray(src, 'SECRET_CONFIG_KEYS');
	const nestedKeys = extractKeyArray(src, 'NESTED_SECRET_KEYS');

	return {
		allowedFiles: ['backend/src/config/configLogger.ts', 'backend/src/config/configSecrets.ts'],
		directReads: ['NODE_ENV'],
		templatedReads: {
			nestedKeys,
			prefixPattern: '{APP_SLUG_UPPER_SNAKE}_',
			securityKeys,
		},
	};
}

function extractKeyArray(src: string, constName: string): string[] {
	const re = new RegExp(`${constName}[^=]*=\\s*\\{([\\s\\S]*?)^\\};`, 'm');
	const match = src.match(re);
	const body = match?.[1];
	if (!body) return [];
	const valRe = /:\s*['"]([A-Z_][A-Z0-9_]*)['"]/g;
	const keys: string[] = [];
	let m: null | RegExpExecArray;
	while ((m = valRe.exec(body)) !== null) {
		if (m[1]) keys.push(m[1]);
	}
	return keys.sort();
}

function checkEnvShape(): SurfaceCheck {
	const live = extractEnvShape();
	const baselineRaw = readJson(join(baselineDir, 'env-shape.json')) as EnvShape & {
		_note?: string;
	};
	const baseline: EnvShape = {
		allowedFiles: [...baselineRaw.allowedFiles].sort(),
		directReads: [...baselineRaw.directReads].sort(),
		templatedReads: {
			nestedKeys: [...baselineRaw.templatedReads.nestedKeys].sort(),
			prefixPattern: baselineRaw.templatedReads.prefixPattern,
			securityKeys: [...baselineRaw.templatedReads.securityKeys].sort(),
		},
	};
	const liveSorted: EnvShape = {
		allowedFiles: [...live.allowedFiles].sort(),
		directReads: [...live.directReads].sort(),
		templatedReads: {
			nestedKeys: [...live.templatedReads.nestedKeys].sort(),
			prefixPattern: live.templatedReads.prefixPattern,
			securityKeys: [...live.templatedReads.securityKeys].sort(),
		},
	};
	const passed = JSON.stringify(liveSorted) === JSON.stringify(baseline);
	return {
		detail: passed
			? 'identical to v3.13.0-lts baseline'
			: 'drift detected — process.env read surface changed since LTS tag',
		name: 'env-shape',
		passed,
	};
}

function main(): void {
	// The LTS surface guard only applies to the spernakit template repo, where the
	// v3.13.0-lts baselines live under docs/lts-baseline/. Apps scaffolded from the
	// template do not carry those baselines and have no LTS contract to uphold, so
	// skip the guard there instead of ENOENT-failing their smoke:qc.
	if (!existsSync(baselineDir)) {
		console.log(
			'[SKIP] LTS surface guard — no docs/lts-baseline/ (not the spernakit template repo).'
		);
		process.exit(0);
	}

	console.log('Checking LTS surface against v3.13.0-lts baselines...');
	console.log('');

	const checks: SurfaceCheck[] = [checkTemplateManifest(), checkConfigSchema(), checkEnvShape()];

	let failed = 0;
	for (const c of checks) {
		const icon = c.passed ? '✅' : '❌';
		console.log(`   ${icon} ${c.name.padEnd(20)} ${c.detail}`);
		if (!c.passed) failed++;
	}

	console.log('');
	if (failed === 0) {
		console.log('LTS surface intact.');
		process.exit(0);
	}
	console.error(`LTS surface drift in ${failed} area(s). Either revert or cut a successor line.`);
	process.exit(1);
}

main();
