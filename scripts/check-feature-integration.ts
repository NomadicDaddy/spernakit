#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Fails the build when:
 *   1 - A backend route plugin exported from backend route index files
 *       that is not registered in create-api-app.ts
 *   2 - A page component under frontend/src/pages/ with a route
 *       is missing from frontend/src/routes/lazyPages.ts
 *   3 - A file under frontend/src/pages/ or frontend/src/components/
 *       imports a shared skeleton via the forbidden shorthand path
 *       (`@/components/shared/<Name>` instead of
 *       `@/components/shared/skeletons/<Name>`)
 *
 * Run: bun scripts/check-feature-integration.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readText(relPath: string): string {
	return readFileSync(resolve(ROOT, relPath), 'utf8');
}

/** Extract all named exports matching `export { X, Y }` from source text. */
function extractNamedExports(source: string): string[] {
	const names: string[] = [];
	for (const line of source.matchAll(/export\s*\{([^}]+)\}/g)) {
		const items = line[1]!.split(',').map((s) =>
			s
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim()
		);
		names.push(...items.filter(Boolean));
	}
	return names;
}

/** Extract `.use(xxxRoutes)` identifiers from the route registration block. */
function extractUseCalls(source: string): string[] {
	const names: string[] = [];
	for (const m of source.matchAll(/\.use\(([A-Za-z_][A-Za-z0-9_]*)\)/g)) {
		names.push(m[1]!);
	}
	return names;
}

/** Extract `lazyNamed(() => import('@/pages/XXX/YYY'), 'ZZZ')` page references. */
function extractLazyPageImports(source: string): string[] {
	const pages: string[] = [];
	for (const m of source.matchAll(/import\('(@\/pages\/[^']+)'\)/g)) {
		// Store as "pages/XXX/YYY" (without @/) for comparison with filesystem paths
		pages.push(m[1]!.replace('@/', ''));
	}
	return pages;
}

/** Recursively list index.ts barrel files under route directories. */
function listRouteBarrelFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			const indexPath = resolve(full, 'index.ts');
			try {
				if (statSync(indexPath).isFile()) {
					results.push(indexPath);
				}
			} catch {
				// no index.ts in this subdirectory
			}
		} else if (entry.isFile() && entry.name === 'index.ts') {
			results.push(full);
		}
	}
	return results;
}

// ---------------------------------------------------------------------------
// Check 1: Backend route registration
// ---------------------------------------------------------------------------

function checkBackendRoutes(): string[] {
	const errors: string[] = [];

	const createApiApp = readText('backend/src/create-api-app.ts');
	const registeredRoutes = new Set(extractUseCalls(createApiApp));

	// Find all route barrel index.ts files
	const routesDir = resolve(ROOT, 'backend/src/routes');
	const barrelFiles = listRouteBarrelFiles(routesDir);

	// Domain barrels may aggregate leaf routes via internal .use(...) calls and
	// export only the composed aggregator. Any leaf .use()'d inside a barrel
	// counts as registered as long as the aggregator that owns it is itself
	// .use()'d in create-api-app.ts — which the per-export check below verifies.
	for (const barrelFile of barrelFiles) {
		const source = readFileSync(barrelFile, 'utf8');
		extractUseCalls(source).forEach((name) => registeredRoutes.add(name));
	}

	for (const barrelFile of barrelFiles) {
		const source = readFileSync(barrelFile, 'utf8');
		const exported = extractNamedExports(source);
		// Filter to route-like exports (ending in "Routes")
		const routeExports = exported.filter((e) => e.endsWith('Routes'));
		for (const routeExport of routeExports) {
			// wsRoutes is registered via WebSocket upgrade handler, not .use()
			if (routeExport === 'wsRoutes') continue;
			if (!registeredRoutes.has(routeExport)) {
				const rel = barrelFile
					.replace(resolve(ROOT, 'backend/src/routes/'), '')
					.replace(/\\/g, '/');
				errors.push(
					`  Route "${routeExport}" exported from backend/src/routes/${rel} but not .use()'d in create-api-app.ts (or any domain aggregator)`
				);
			}
		}
	}

	return errors;
}

// ---------------------------------------------------------------------------
// Check 2: Frontend lazy pages
// ---------------------------------------------------------------------------

function checkFrontendPages(): string[] {
	const errors: string[] = [];

	const lazyPagesSource = readText('frontend/src/routes/lazyPages.ts');
	const registeredPages = new Set(extractLazyPageImports(lazyPagesSource));

	// Collect all *Page.tsx files under pages/
	const pagesDir = resolve(ROOT, 'frontend/src/pages');
	const pageFiles: string[] = [];

	function walk(dir: string) {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith('Page.tsx')) {
				pageFiles.push(full);
			}
		}
	}
	walk(pagesDir);

	for (const pageFile of pageFiles) {
		// Normalize to forward-slash relative path without extension: "pages/analytics/BusinessMetricsPage"
		const rel = pageFile
			.replace(`${resolve(ROOT, 'frontend/src')}\\`, '')
			.replace(`${resolve(ROOT, 'frontend/src')}/`, '')
			.replace(/\\/g, '/')
			.replace(/\.tsx$/, '');
		if (!registeredPages.has(rel)) {
			errors.push(
				`  Page "${rel}" exists but is not imported in frontend/src/routes/lazyPages.ts`
			);
		}
	}

	return errors;
}

// ---------------------------------------------------------------------------
// Check 3: Skeleton import paths
// ---------------------------------------------------------------------------

const SKELETON_NAMES = [
	'CardSkeleton',
	'ChartSkeleton',
	'ContentListSkeleton',
	'StatCardSkeleton',
	'TableSkeleton',
] as const;

function checkSkeletonImportPaths(): string[] {
	const errors: string[] = [];
	const pattern = new RegExp(
		`from\\s+['"]@/components/shared/(${SKELETON_NAMES.join('|')})['"]`,
		'g'
	);

	function walk(dir: string) {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
				const source = readFileSync(full, 'utf8');
				for (const match of source.matchAll(pattern)) {
					const rel = full
						.replace(`${ROOT}\\`, '')
						.replace(`${ROOT}/`, '')
						.replace(/\\/g, '/');
					errors.push(
						`  ${rel}: imports "${match[1]}" from "@/components/shared/${match[1]}" — ` +
							`use "@/components/shared/skeletons/${match[1]}" instead`
					);
				}
			}
		}
	}
	walk(resolve(ROOT, 'frontend/src/pages'));
	walk(resolve(ROOT, 'frontend/src/components'));

	return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allErrors: string[] = [];

const backendErrors = checkBackendRoutes();
if (backendErrors.length > 0) {
	allErrors.push('Backend route registration mismatches:', ...backendErrors);
}

const frontendErrors = checkFrontendPages();
if (frontendErrors.length > 0) {
	allErrors.push('Frontend page registration mismatches:', ...frontendErrors);
}

const skeletonErrors = checkSkeletonImportPaths();
if (skeletonErrors.length > 0) {
	allErrors.push(
		'Forbidden skeleton import shorthand (use "@/components/shared/skeletons/<Name>"):',
		...skeletonErrors
	);
}

if (allErrors.length > 0) {
	console.error('[FAIL] Feature integration check found issues:');
	for (const line of allErrors) {
		console.error(line);
	}
	process.exit(1);
}

console.log('[OK] Feature integration check passed.');
