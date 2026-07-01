#!/usr/bin/env bun
/**
 * Secrets File Shape Check
 *
 * Guards against shape drift between `config/{slug}.secrets.json` and its
 * companion `config/{slug}.secrets.json.example`. In one derived app the two
 * files drifted silently — the example advertised one provider key while the
 * live file actually used another, and `github.token` was in the example but
 * missing from the live file. Nothing caught it because these files are
 * freeform JSON with no Zod schema.
 *
 * This check is advisory: apps that don't use the split-secrets pattern
 * (most of them — see STACK.md "Secrets file pattern") have neither file,
 * and the check is a no-op. When only one file exists, the check still
 * passes, because either can legitimately exist alone (example-only for
 * apps where the operator hasn't populated their secrets yet, live-only
 * when the example was never committed).
 *
 * When BOTH files exist, the check compares the nested key structure and
 * fails on mismatches — the only contract these two files must uphold.
 *
 * Usage:
 *   bun scripts/check-secrets-shape.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectRoot } from '../backend/src/config/configUtils.ts';

interface SecretsPair {
	examplePath: string;
	livePath: string;
	slug: string;
}

function collectNestedKeys(value: unknown, prefix = ''): string[] {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
	const keys: string[] = [];
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${k}` : k;
		keys.push(path);
		keys.push(...collectNestedKeys(v, path));
	}
	return keys;
}

function findSecretsPairs(): SecretsPair[] {
	const configDir = join(projectRoot, 'config');
	if (!existsSync(configDir)) return [];

	const pairs: SecretsPair[] = [];
	const seen = new Set<string>();

	for (const entry of readdirSync(configDir)) {
		const match = /^(.+?)\.secrets\.json(\.example)?$/.exec(entry);
		if (!match) continue;
		const slug = match[1];
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		pairs.push({
			examplePath: join(configDir, `${slug}.secrets.json.example`),
			livePath: join(configDir, `${slug}.secrets.json`),
			slug,
		});
	}

	return pairs;
}

function loadJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch (err) {
		throw new Error(
			`Failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}
}

interface CheckResult {
	extraInExample: string[];
	extraInLive: string[];
	message: string;
	slug: string;
	status: 'fail' | 'pass' | 'skip';
}

function checkPair(pair: SecretsPair): CheckResult {
	const liveExists = existsSync(pair.livePath);
	const exampleExists = existsSync(pair.examplePath);

	if (!liveExists && !exampleExists) {
		return {
			extraInExample: [],
			extraInLive: [],
			message: 'neither file present',
			slug: pair.slug,
			status: 'skip',
		};
	}
	if (!liveExists || !exampleExists) {
		return {
			extraInExample: [],
			extraInLive: [],
			message: liveExists
				? 'live file present, example missing (operators cannot discover secret keys)'
				: 'example present, live file not yet populated',
			slug: pair.slug,
			status: 'skip',
		};
	}

	const live = loadJson(pair.livePath);
	const example = loadJson(pair.examplePath);

	const liveKeys = new Set(collectNestedKeys(live));
	const exampleKeys = new Set(collectNestedKeys(example));

	const extraInLive = [...liveKeys].filter((k) => !exampleKeys.has(k)).sort();
	const extraInExample = [...exampleKeys].filter((k) => !liveKeys.has(k)).sort();

	const drift = extraInLive.length + extraInExample.length;
	return {
		extraInExample,
		extraInLive,
		message: drift === 0 ? 'shape matches' : `${drift} key(s) diverge`,
		slug: pair.slug,
		status: drift === 0 ? 'pass' : 'fail',
	};
}

function main(): void {
	const pairs = findSecretsPairs();

	if (pairs.length === 0) {
		console.log('[OK] No secrets files found — nothing to check.');
		process.exit(0);
	}

	const results = pairs.map(checkPair);
	const failures = results.filter((r) => r.status === 'fail');

	for (const r of results) {
		const tag = r.status === 'fail' ? 'FAIL' : r.status === 'skip' ? 'SKIP' : 'OK  ';
		console.log(`[${tag}] ${r.slug}.secrets.json — ${r.message}`);
		if (r.extraInLive.length > 0) {
			console.log(
				`       keys in live but missing from .example: ${r.extraInLive.join(', ')}`
			);
		}
		if (r.extraInExample.length > 0) {
			console.log(
				`       keys in .example but missing from live: ${r.extraInExample.join(', ')}`
			);
		}
	}

	if (failures.length > 0) {
		console.log(
			'\nFix: make the two files have matching nested key structure. ' +
				'Values can (and should) differ — the example holds placeholders and ' +
				'the live file holds real secrets — but the keys must match so ' +
				'operators can discover every secret path from the example alone.'
		);
		process.exit(1);
	}

	process.exit(0);
}

main();
