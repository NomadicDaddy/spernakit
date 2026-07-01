#!/usr/bin/env bun
/**
 * Config Invariants Guard
 *
 * Fails on observed, recurring config regressions:
 *
 * 1. `backend/src/config/defaults.json` — rateLimit.enabled must be true.
 *    The 30-day archaeology report (2026-04-04) found four silent flips of
 *    this toggle in 19 days during dev work.
 *
 * 2. `package.json` — in derived apps, `version` must not equal
 *    `spernakit_version`. The template-upgrade machinery (or an AI doing
 *    manual dependency merges during `/template-upgrade`) repeatedly
 *    contaminated the app's version with the template version across
 *    multiple upgrade cycles (v3.1.2, v3.1.12, v3.1.14). The fix in
 *    applyBrandingPackageJson() blocks one path; this invariant catches
 *    all paths at the quality gate.
 *
 * Scope is intentionally narrow: checks only for regressions we've hit.
 * Expand only with a documented justification — do not pre-emptively guard
 * every field.
 *
 * Usage:
 *   bun scripts/check-config-invariants.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const defaultsPath = join(projectRoot, 'backend/src/config/defaults.json');
const packageJsonPath = join(projectRoot, 'package.json');

interface Invariant {
	actual: unknown;
	expected: unknown;
	message: string;
	name: string;
}

function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object')
			return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function checkDefaultsInvariants(): string[] {
	const raw = readFileSync(defaultsPath, 'utf-8');
	const defaults = JSON.parse(raw) as Record<string, unknown>;

	const invariants: Invariant[] = [
		{
			actual: getNestedValue(defaults, 'rateLimit.enabled'),
			expected: true,
			message:
				'defaults.json must ship with rateLimit.enabled=true. If you disabled this ' +
				'locally to work around 429s during development, revert before committing. ' +
				'See docs/template/adr/adr-009-rate-limit-policy.md for the policy.',
			name: 'rateLimit.enabled',
		},
	];

	const failures = invariants.filter((i) => i.actual !== i.expected);
	return failures.map(
		(f) =>
			`defaults.json ${f.name}: expected ${String(f.expected)}, got ${String(f.actual)}\n    ${f.message}`
	);
}

function checkPackageJsonInvariants(): string[] {
	const raw = readFileSync(packageJsonPath, 'utf-8');
	const pkg = JSON.parse(raw) as Record<string, unknown>;

	// Only derived apps have spernakit_version — skip on the template itself.
	if (!('spernakit_version' in pkg)) return [];

	const failures: string[] = [];
	const version = pkg['version'];
	const spernakitVersion = pkg['spernakit_version'];

	if (version === spernakitVersion) {
		failures.push(
			`package.json version: "${String(version)}" matches spernakit_version ("${String(spernakitVersion)}"). ` +
				"This is the contamination signature from template-upgrade: the template's own version " +
				"was copied into the app's version field. Restore the app's real version (check git " +
				'history or config/*.json) and keep spernakit_version as the tracker.'
		);
	}

	return failures;
}

function main(): void {
	const failures: string[] = [...checkDefaultsInvariants(), ...checkPackageJsonInvariants()];

	if (failures.length === 0) {
		console.log('[OK] Config invariants passed.');
		return;
	}

	console.error('[FAIL] Config invariants violated:');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}

main();
