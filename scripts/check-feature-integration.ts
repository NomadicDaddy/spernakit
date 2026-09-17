#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Enforces: ASSERT-001 -- every backend route file is registered in `create-api-app.ts` -- and
 * ASSERT-002 -- every `*Page.tsx` is lazy-imported in `routes/lazyPages.ts`. The remaining checks,
 * on shared-skeleton import paths and shared-to-page dependencies, have no assertion IDs.
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
 *   4 - A shared frontend module under components/, hooks/, lib/, or stores/
 *       imports a route-owned module under pages/
 *   5 - Application source uses manual React memoization without a file-level
 *       'use no memo' directive
 *
 * Run: bun scripts/check-feature-integration.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { checkBackendRoutes } from './lib/feature-integration/backend-routes.ts';
import { checkCompilerMemoization } from './lib/feature-integration/compiler-memoization.ts';

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

function checkFrontendPages(root: string): { errors: string[]; pages: number } {
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

	return { errors, pages: pageFiles.length };
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

function checkSkeletonImportPaths(root: string): { errors: string[]; scanned: number } {
	const errors: string[] = [];
	let scanned = 0;
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
				scanned += 1;
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

	return { errors, scanned };
}

// ---------------------------------------------------------------------------
// Check 4: Shared frontend layers do not depend on route-owned page modules
// ---------------------------------------------------------------------------

const SHARED_FRONTEND_DIRECTORIES = ['components', 'hooks', 'lib', 'stores'] as const;
const MODULE_SPECIFIER_PATTERNS = [
	/\b(?:from|import\s*\()\s*['"]([^'"]+)['"]/g,
	/\bimport\s+['"]([^'"]+)['"]/g,
] as const;

function extractModuleSpecifiers(source: string): ReadonlySet<string> {
	const specifiers = new Set<string>();
	for (const pattern of MODULE_SPECIFIER_PATTERNS) {
		for (const match of source.matchAll(pattern)) {
			if (match[1]) specifiers.add(match[1]);
		}
	}
	return specifiers;
}

function isPageModuleImport(frontendRoot: string, importer: string, specifier: string): boolean {
	if (specifier === '@/pages' || specifier.startsWith('@/pages/')) return true;
	if (!specifier.startsWith('.')) return false;

	const pagesRoot = resolve(frontendRoot, 'pages');
	const importedPath = resolve(dirname(importer), specifier);
	return importedPath === pagesRoot || importedPath.startsWith(`${pagesRoot}${sep}`);
}

function checkSharedFrontendImports(root: string): { errors: string[]; scanned: number } {
	const errors: string[] = [];
	const frontendRoot = resolve(root, 'frontend/src');
	let scanned = 0;

	function walk(dir: string) {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
				scanned += 1;
				const source = readFileSync(full, 'utf8');
				for (const specifier of extractModuleSpecifiers(source)) {
					if (!isPageModuleImport(frontendRoot, full, specifier)) continue;
					const rel = relative(root, full).replace(/\\/g, '/');
					errors.push(
						`  ${rel}: shared modules must not import page module "${specifier}"`,
					);
				}
			}
		}
	}

	for (const directory of SHARED_FRONTEND_DIRECTORIES) {
		walk(resolve(frontendRoot, directory));
	}

	return { errors, scanned };
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

	const frontend = checkFrontendPages(root);
	if (frontend.errors.length > 0) {
		allErrors.push('Frontend page registration mismatches:', ...frontend.errors);
	}

	const skeleton = checkSkeletonImportPaths(root);
	if (skeleton.errors.length > 0) {
		allErrors.push(
			'Forbidden skeleton import shorthand (use "@/components/shared/skeletons/<Name>"):',
			...skeleton.errors,
		);
	}

	const sharedFrontend = checkSharedFrontendImports(root);
	if (sharedFrontend.errors.length > 0) {
		allErrors.push('Forbidden shared-to-page frontend dependencies:', ...sharedFrontend.errors);
	}

	const compilerMemoization = checkCompilerMemoization(root);
	if (compilerMemoization.errors.length > 0) {
		allErrors.push('React Compiler source-contract violations:', ...compilerMemoization.errors);
	}

	if (allErrors.length > 0) {
		console.error('[FAIL] Feature integration check found issues:');
		for (const line of allErrors) {
			console.error(line);
		}
		return 1;
	}

	// Rule 6: the walks are recursive over directories that are expected to exist. A renamed
	// `pages/` directory makes every page "registered" -- there is nothing left to be unregistered --
	// and either import scan finds no forbidden dependency because it opened no file.
	if (
		frontend.pages === 0 ||
		skeleton.scanned === 0 ||
		sharedFrontend.scanned === 0 ||
		compilerMemoization.scanned === 0
	) {
		console.error(
			`[FAIL] Feature integration examined too little to be a pass: ${frontend.pages} page(s) ` +
				`under frontend/src/pages, ${skeleton.scanned} component file(s), ` +
				`${sharedFrontend.scanned} shared frontend file(s), and ` +
				`${compilerMemoization.scanned} compiler-owned source file(s) scanned.`,
		);
		return 1;
	}

	console.log(
		`[OK] Feature integration check passed (${frontend.pages} page(s) registered, ` +
			`${skeleton.scanned} component file(s), ${sharedFrontend.scanned} shared frontend ` +
			`file(s), and ${compilerMemoization.scanned} compiler-owned source file(s) scanned).`,
	);
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
