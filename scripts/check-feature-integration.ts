#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Fails the build when:
 *   1 - An Elysia instance exported from a backend route module that is not
 *       reachable from create-api-app.ts through .use() calls
 *   2 - A page component under frontend/src/pages/ with a route
 *       is missing from frontend/src/routes/lazyPages.ts
 *   3 - A file under frontend/src/pages/ or frontend/src/components/
 *       imports a shared skeleton via the forbidden shorthand path
 *       (`@/components/shared/<Name>` instead of
 *       `@/components/shared/skeletons/<Name>`)
 *
 * Run: bun scripts/check-feature-integration.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { checkBackendRoutes } from './lib/feature-integration/backend-routes.ts';

function resolveProjectRoot(): string {
	const rootFlag = process.argv.indexOf('--root');
	if (rootFlag === -1) return resolve(import.meta.dir, '..');
	const root = process.argv[rootFlag + 1];
	if (!root) throw new Error('--root requires a project directory');
	return resolve(root);
}

const ROOT = resolveProjectRoot();

function readText(relPath: string): string {
	return readFileSync(resolve(ROOT, relPath), 'utf8');
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
				`  Page "${rel}" exists but is not imported in frontend/src/routes/lazyPages.ts`,
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
		'g',
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
							`use "@/components/shared/skeletons/${match[1]}" instead`,
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

const backendErrors = checkBackendRoutes(ROOT);
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
		...skeletonErrors,
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
