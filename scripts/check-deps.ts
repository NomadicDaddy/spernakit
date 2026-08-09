#!/usr/bin/env bun
/**
 * Checks that all dependencies across every workspace package.json (root,
 * backend, frontend, shared) are pinned to exact semver versions.
 *
 * Enforces: every dependency spec is exact semver or `workspace:*`, in dependency blocks and in
 * `overrides`/`resolutions` alike. No assertion ID: the pinning policy lives in `docs/stack.md`
 * rather than in the assertion catalog.
 *
 * Rejects any spec that is not exact semver or `workspace:*` — this catches
 * `^`/`~` prefixes as well as `>=`, `*`, `latest`, ranges, and git/url specs.
 * The `overrides`/`resolutions` blocks are checked too, so a floating override
 * cannot reintroduce version drift.
 *
 * Also verifies that the critical backend/frontend dependencies are still
 * present in their respective manifests (guards against accidental removal),
 * including the shared workspace both of them import from.
 *
 * See docs/stack.md for the version pinning policy.
 */

import { readFileSync } from 'fs';
import { exit } from 'node:process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Exact semver: MAJOR.MINOR.PATCH with optional prerelease/build metadata. */
const EXACT_SEMVER_PATTERN =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Critical backend dependencies that must be present in backend/package.json.
 * These are core framework, database, auth, and logging dependencies.
 */
const CRITICAL_BACKEND_DEPS = [
	// Core framework
	'elysia',
	'@elysiajs/swagger',
	// Database
	'drizzle-orm',
	'drizzle-kit',
	// Auth & validation
	'jsonwebtoken',
	'@sinclair/typebox',
	// Utilities
	'nodemailer',
	'pino',
	'pino-pretty',
	'pino-roll',
	// Build tools
	'typescript',
];

/**
 * Critical frontend dependencies that must be present in frontend/package.json.
 * These are core React, routing, state management, and build dependencies.
 */
const CRITICAL_FRONTEND_DEPS = [
	// Core React
	'react',
	'react-dom',
	// Routing
	'react-router',
	// Data fetching & state
	'@tanstack/react-query',
	'zustand',
	// Build tools
	'vite',
	'typescript',
];

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	overrides?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	resolutions?: Record<string, string>;
}

interface PackageTarget {
	criticalDeps: string[];
	name: string;
	path: string;
}

/**
 * The shared workspace's package name, read rather than written down here.
 *
 * `shared/package.json` naming is branded in the template manifest, so a literal would be right in
 * the template and wrong in any app that renamed it — failing that app on a dependency it declares
 * correctly. Reading it asserts the invariant instead of a spelling: both consumers declare the
 * workspace they import their types from.
 *
 * Its absence is what this exists to catch, and neither list held it before. One app ran for two
 * days with the dependency gone from backend/package.json and every gate green, because an earlier
 * install had left a resolvable link behind in node_modules; only wiping the tree exposed it. A
 * missing-dependency check that omits the dependency whose absence breaks the schema layer is the
 * one omission it could not afford.
 */
function sharedPackageName(manifest: string): null | string {
	const { name } = JSON.parse(readFileSync(manifest, 'utf-8')) as { name?: string };
	return typeof name === 'string' && name.length > 0 ? name : null;
}

function isAllowedSpec(spec: string): boolean {
	return spec === 'workspace:*' || EXACT_SEMVER_PATTERN.test(spec);
}

function collectSpecs(pkg: PackageJson): Record<string, string> {
	const blocks: (Record<string, string> | undefined)[] = [
		pkg.dependencies,
		pkg.devDependencies,
		pkg.optionalDependencies,
		pkg.peerDependencies,
		pkg.overrides,
		pkg.resolutions,
	];
	const specs: Record<string, string> = {};
	for (const block of blocks) {
		Object.assign(specs, block ?? {});
	}
	return specs;
}

interface TargetResult {
	ok: boolean;
	/** Dependency specs read from this manifest. Zero means nothing was checked. */
	specs: number;
}

function checkDependencyVersions(target: PackageTarget): TargetResult {
	const content = readFileSync(target.path, 'utf-8');
	const pkg = JSON.parse(content) as PackageJson;

	const specs = collectSpecs(pkg);
	const total = Object.keys(specs).length;
	let ok = true;

	// Rule 5's legitimate-emptiness case. `shared` is a types-and-utilities workspace with no
	// dependencies at all, so zero specs is its correct state, not a truncated manifest. Say so
	// rather than printing "[OK] All 0 dependency spec(s) are exact", which is the vacuous pass
	// the rule exists to stop: it reads as a verdict about specs nobody looked at.
	if (total === 0) {
		console.log(`[SKIP] ${target.name}: declares no dependencies; nothing to pin.`);
		return { ok: true, specs: 0 };
	}

	const invalid = Object.entries(specs).filter(([, spec]) => !isAllowedSpec(spec));
	if (invalid.length > 0) {
		console.error(
			`[FAIL] ${target.name}: Found ${invalid.length} non-exact dependency spec(s) (exact versions or workspace:* required):`,
		);
		invalid.forEach(([name, spec]) => console.error(`   - ${name}: ${spec}`));
		ok = false;
	}

	const missing = target.criticalDeps.filter((dep) => !(dep in specs));
	if (missing.length > 0) {
		console.error(`[FAIL] ${target.name}: Missing critical dependencies:`);
		missing.forEach((dep) => console.error(`   - ${dep}`));
		ok = false;
	}

	if (ok) {
		console.log(
			`[OK] ${target.name}: All ${total} dependency spec(s) are exact ` +
				`(${target.criticalDeps.length} critical dep(s) present)`,
		);
	}
	return { ok, specs: total };
}

export function runDeps(): number {
	console.log('Checking dependency version pinning across all workspaces...\n');

	const sharedManifest = join(__dirname, '..', 'shared', 'package.json');
	const shared = sharedPackageName(sharedManifest);
	const withShared = (deps: string[]): string[] => (shared === null ? deps : [...deps, shared]);

	const targets: PackageTarget[] = [
		{ criticalDeps: [], name: 'root', path: join(__dirname, '..', 'package.json') },
		{
			criticalDeps: withShared(CRITICAL_BACKEND_DEPS),
			name: 'backend',
			path: join(__dirname, '..', 'backend', 'package.json'),
		},
		{
			criticalDeps: withShared(CRITICAL_FRONTEND_DEPS),
			name: 'frontend',
			path: join(__dirname, '..', 'frontend', 'package.json'),
		},
		{ criticalDeps: [], name: 'shared', path: sharedManifest },
	];

	const results = targets.map((target) => checkDependencyVersions(target));
	const specs = results.reduce((running, result) => running + result.specs, 0);

	console.log();

	if (results.every((result) => result.ok)) {
		console.log(
			`[OK] All ${specs} dependency spec(s) across ${targets.length} workspace(s) are properly pinned`,
		);
		return 0;
	}

	console.error('[FAIL] Some dependencies are not pinned to exact versions');
	console.error('   Use exact versions (e.g., "react": "19.2.7") or "workspace:*"');
	return 1;
}

if (import.meta.main) exit(runDeps());
