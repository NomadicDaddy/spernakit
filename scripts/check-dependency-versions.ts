#!/usr/bin/env bun
/**
 * Checks that all dependencies across every workspace package.json (root,
 * backend, frontend, shared) are pinned to exact semver versions.
 *
 * Rejects any spec that is not exact semver or `workspace:*` — this catches
 * `^`/`~` prefixes as well as `>=`, `*`, `latest`, ranges, and git/url specs.
 * The `overrides`/`resolutions` blocks are checked too, so a floating override
 * cannot reintroduce version drift.
 *
 * Also verifies that the critical backend/frontend dependencies are still
 * present in their respective manifests (guards against accidental removal).
 *
 * See docs/stack.md for the version pinning policy.
 */

import { readFileSync } from 'fs';
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
	'react-router-dom',
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

function checkDependencyVersions(target: PackageTarget): boolean {
	const content = readFileSync(target.path, 'utf-8');
	const pkg = JSON.parse(content) as PackageJson;

	const specs = collectSpecs(pkg);
	let ok = true;

	const invalid = Object.entries(specs).filter(([, spec]) => !isAllowedSpec(spec));
	if (invalid.length > 0) {
		console.error(
			`❌ ${target.name}: Found ${invalid.length} non-exact dependency spec(s) (exact versions or workspace:* required):`
		);
		invalid.forEach(([name, spec]) => console.error(`   - ${name}: ${spec}`));
		ok = false;
	}

	const missing = target.criticalDeps.filter((dep) => !(dep in specs));
	if (missing.length > 0) {
		console.error(`❌ ${target.name}: Missing critical dependencies:`);
		missing.forEach((dep) => console.error(`   - ${dep}`));
		ok = false;
	}

	if (ok) {
		console.log(`✅ ${target.name}: All dependency specs are exact (critical deps present)`);
	}
	return ok;
}

function main(): void {
	console.log('Checking dependency version pinning across all workspaces...\n');

	const targets: PackageTarget[] = [
		{ criticalDeps: [], name: 'root', path: join(__dirname, '..', 'package.json') },
		{
			criticalDeps: CRITICAL_BACKEND_DEPS,
			name: 'backend',
			path: join(__dirname, '..', 'backend', 'package.json'),
		},
		{
			criticalDeps: CRITICAL_FRONTEND_DEPS,
			name: 'frontend',
			path: join(__dirname, '..', 'frontend', 'package.json'),
		},
		{ criticalDeps: [], name: 'shared', path: join(__dirname, '..', 'shared', 'package.json') },
	];

	const results = targets.map((target) => checkDependencyVersions(target));

	console.log();

	if (results.every(Boolean)) {
		console.log('✅ All dependencies are properly pinned');
		process.exit(0);
	} else {
		console.error('❌ Some dependencies are not pinned to exact versions');
		console.error('   Use exact versions (e.g., "react": "19.2.7") or "workspace:*"');
		process.exit(1);
	}
}

main();
