#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Enforces: ASSERT-001 -- every backend route file is registered in `create-api-app.ts` -- and
 * ASSERT-002 -- every `*Page.tsx` is lazy-imported in `routes/lazyPages.ts`. The third check below,
 * on shared-skeleton import paths, has no assertion ID.
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
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { checkBackendRoutes } from './lib/feature-integration/backend-routes.ts';

function readText(root: string, relPath: string): string {
	return readFileSync(resolve(root, relPath), 'utf8');
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

function checkFrontendPages(root: string): string[] {
	const errors: string[] = [];

	const lazyPagesSource = readText(root, 'frontend/src/routes/lazyPages.ts');
	const registeredPages = new Set(extractLazyPageImports(lazyPagesSource));

	// Collect all *Page.tsx files under pages/
	const pagesDir = resolve(root, 'frontend/src/pages');
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
			.replace(`${resolve(root, 'frontend/src')}\\`, '')
			.replace(`${resolve(root, 'frontend/src')}/`, '')
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

function checkSkeletonImportPaths(root: string): string[] {
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
						.replace(`${root}\\`, '')
						.replace(`${root}/`, '')
						.replace(/\\/g, '/');
					errors.push(
						`  ${rel}: imports "${match[1]}" from "@/components/shared/${match[1]}" — ` +
							`use "@/components/shared/skeletons/${match[1]}" instead`,
					);
				}
			}
		}
	}
	walk(resolve(root, 'frontend/src/pages'));
	walk(resolve(root, 'frontend/src/components'));

	return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function runFeatureIntegration(root: string = resolve(import.meta.dir, '..')): number {
	const allErrors: string[] = [];

	const backendErrors = checkBackendRoutes(root);
	if (backendErrors.length > 0) {
		allErrors.push('Backend route registration mismatches:', ...backendErrors);
	}

	const frontendErrors = checkFrontendPages(root);
	if (frontendErrors.length > 0) {
		allErrors.push('Frontend page registration mismatches:', ...frontendErrors);
	}

	const skeletonErrors = checkSkeletonImportPaths(root);
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
		return 1;
	}

	console.log('[OK] Feature integration check passed.');
	return 0;
}

if (import.meta.main) {
	// `--root` names a directory to scan instead of this repository; a typo has to exit 2 rather
	// than report a clean pass over the default root, which is what a silently ignored flag does.
	let root: string | undefined;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { root: { type: 'string' } },
			strict: true,
		});
		root = values.root;
	} catch (err) {
		console.error(`[FAIL] check-feature-integration: ${(err as Error).message}`);
		console.error('Usage: check-feature-integration [--root <dir>]');
		exit(2);
	}
	exit(runFeatureIntegration(root ? resolve(root) : undefined));
}
