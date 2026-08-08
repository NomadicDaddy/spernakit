#!/usr/bin/env bun
/**
 * Critical-Path Verification Script
 *
 * Enforces: the first page load stays within its recorded byte budget and keeps its chunk shape.
 * No assertion ID -- ASSERT-040 is the neighbouring performance invariant and covers compression
 * of served assets, not what the browser must fetch before first render.
 *
 * Guards the bytes and the *shape* of the first page load. `verify-minification.ts`
 * caps total JS across the whole build, which is structurally blind to how those
 * bytes are distributed: a release that moved the React runtime out of the preloaded
 * `react-core` chunk and into the lazy `grid-layout` chunk changed the total by zero
 * bytes while adding a serialized round trip to every page load. Total-size budgets
 * cannot see that. These three checks can:
 *
 *   1. BUDGET    — brotli bytes of everything the browser must fetch before first
 *                  render stay under budget, and blocking JS stays at or below the
 *                  recorded gzip ceiling. Both limits live in
 *                  scripts/critical-path-budget.json, which is per-app generated
 *                  state (see scripts/lib/critical-path-budget.ts).
 *   2. RUNTIME   — the React runtime sits in a chunk that index.html preloads, so it
 *                  is never discovered late.
 *   3. WATERFALL — the entry chunk never statically imports a chunk that is not
 *                  preloaded. That combination is the round-trip bug by definition:
 *                  the browser cannot know it needs the chunk until it parses the entry.
 *
 * Regenerate the budget after intentional growth:
 *   bun scripts/check-critical-path.ts --update-budget
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

import {
	evaluateCriticalPathBudget,
	kb,
	writeCriticalPathBudget,
} from './lib/critical-path-budget.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'frontend', 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const INDEX_HTML = join(DIST_DIR, 'index.html');
const BUDGET_PATH = join(__dirname, 'critical-path-budget.json');

/**
 * Markers that must ALL appear in a chunk before it counts as React's production
 * runtime. `react.transitional.element` is built only by `react.production.js`;
 * `react.fragment` alone is NOT sufficient — any library doing react-is-style
 * `Symbol.for('react.fragment')` checks (recharts, react-redux) contains it, and
 * on Linux readdir order that false match can be visited first.
 */
const REACT_RUNTIME_MARKERS = ['react.transitional.element', 'react.fragment'];

// ANSI color codes
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};
function log(message: string, color = 'reset'): void {
	console.log(`${colors[color] ?? colors['reset']}${message}${colors['reset']}`);
}
interface CriticalAsset {
	brotliBytes: number;
	gzipBytes: number;
	name: string;
	rawBytes: number;
}
/**
 * Assets the browser must fetch before it can render: the entry module, everything
 * index.html asks it to modulepreload, and the render-blocking stylesheets.
 * Deliberately excludes prefetch/lazy chunks — those are off the critical path.
 */
function parseCriticalAssets(html: string): string[] {
	const names = new Set<string>();

	// Match whole tags, then inspect their attributes, rather than assuming an
	// attribute order. A regex like /rel="modulepreload"[^>]+href=/ silently misses
	// any tag that emits href first, and a gate that under-counts is worse than none.
	// Matched case-insensitively for the same reason: tag and attribute names are
	// case-insensitive in HTML, so a transform emitting <SCRIPT> or TYPE="module"
	// would zero out this scan and report a passing gate having counted nothing.
	for (const tag of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
		const [, tagName = '', attrs = ''] = tag;
		const href = /\b(?:src|href)="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (!href) continue;

		if (tagName.toLowerCase() === 'script') {
			if (/\btype="module"/i.test(attrs)) names.add(href);
			continue;
		}
		// Only render-blocking link types belong on the critical path. `prefetch`,
		// `preload as=...`, and `modulepreload` for lazy routes are deliberately excluded.
		if (/\brel="(?:modulepreload|stylesheet)"/i.test(attrs)) names.add(href);
	}
	return [...names];
}

function sizeOf(assetName: string): CriticalAsset {
	const raw = join(ASSETS_DIR, assetName);
	const br = `${raw}.br`;
	const rawBytes = statSync(raw).size;
	// Fall back to raw: vite-plugin-compression2 skips files under its 1 KB threshold,
	// and nginx compresses those on the fly instead.
	const brotliBytes = existsSync(br) ? statSync(br).size : rawBytes;
	const gz = `${raw}.gz`;
	const gzipBytes = existsSync(gz)
		? statSync(gz).size
		: gzipSync(readFileSync(raw), { level: 6 }).byteLength;
	return { brotliBytes, gzipBytes, name: assetName, rawBytes };
}

/**
 * The entry module, located with the same order-independent scan parseCriticalAssets uses. The
 * previous `/<script[^>]+type="module"[^>]+src=/` regex assumed `type` precedes `src`; any bundler
 * or HTML transform emitting them the other way round produced no match, and the caller turned
 * that into a silently skipped waterfall assertion — a gate reporting success having checked
 * nothing. Returns null so the caller must decide explicitly.
 */
function findEntryChunk(html: string): null | string {
	for (const tag of html.matchAll(/<script\b([^>]*)>/gi)) {
		const attrs = tag[1] ?? '';
		if (!/\btype="module"/i.test(attrs)) continue;
		const src = /\bsrc="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (src) return src;
	}
	return null;
}

/** Chunks the entry imports statically, i.e. needed before anything can execute. */
function staticImportsOf(entryName: string): string[] {
	const source = readFileSync(join(ASSETS_DIR, entryName), 'utf-8');
	const imports = new Set<string>();
	// Binding imports (`...from"./c.js"`) AND side-effect imports (`import"./c.js"`). Matching
	// only the first under-reports the waterfall: a side-effect import is just as serialized, and
	// a chunk pulled in purely for its side effects is exactly the kind a refactor introduces
	// without anyone noticing. `import("./c.js")` is deliberately not matched — dynamic imports
	// are lazy by definition and belong off the critical path.
	for (const m of source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) {
		if (m[1]) imports.add(m[1]);
	}
	return [...imports];
}
function findReactRuntimeChunk(): null | string {
	// Only .js chunks can hold the runtime; skip .br/.gz/.map siblings and CSS.
	// Sorted so the result cannot depend on platform readdir order.
	for (const name of readdirSync(ASSETS_DIR)
		.filter((f) => f.endsWith('.js'))
		.sort()) {
		const content = readFileSync(join(ASSETS_DIR, name), 'utf-8');
		if (REACT_RUNTIME_MARKERS.every((marker) => content.includes(marker))) return name;
	}
	return null;
}
function checkBudget(totalBrotli: number, totalGzipJs: number, updateBudget: boolean): boolean {
	const input = {
		budgetPath: BUDGET_PATH,
		totalBrotliBytes: totalBrotli,
		totalGzipJsBytes: totalGzipJs,
	};
	const result = updateBudget
		? writeCriticalPathBudget(input)
		: evaluateCriticalPathBudget(input);
	for (const line of result.lines) log(line.text, line.color);
	return result.ok;
}

export function runCriticalPath(updateBudget = false): number {
	log('\n=== Critical-Path Verification ===\n', 'blue');

	if (!existsSync(INDEX_HTML)) {
		log('[FAIL] frontend/dist/index.html not found — build the frontend first:', 'red');
		log('  bun run build:frontend', 'yellow');
		return 1;
	}

	const html = readFileSync(INDEX_HTML, 'utf-8');
	const criticalNames = parseCriticalAssets(html);
	if (criticalNames.length === 0) {
		log('[FAIL] No entry/modulepreload/stylesheet assets found in index.html', 'red');
		return 1;
	}

	const assets = criticalNames.map(sizeOf).sort((a, b) => b.brotliBytes - a.brotliBytes);
	const totalBrotli = assets.reduce((s, a) => s + a.brotliBytes, 0);
	const totalGzipJs = assets
		.filter((asset) => asset.name.endsWith('.js'))
		.reduce((sum, asset) => sum + asset.gzipBytes, 0);
	const totalRaw = assets.reduce((s, a) => s + a.rawBytes, 0);

	for (const a of assets) {
		log(`${a.name.padEnd(45)} ${kb(a.brotliBytes).padStart(12)} br  (${kb(a.rawBytes)} raw)`);
	}
	log(
		`\n${String(assets.length).padStart(2)} blocking assets   ${kb(totalBrotli)} br  (${kb(totalRaw)} raw)\n`,
		'cyan',
	);

	const budgetOk = checkBudget(totalBrotli, totalGzipJs, updateBudget);

	// --- Check 2: the React runtime must be preloaded, not discovered late ---
	const entryName = findEntryChunk(html);
	if (entryName === null) {
		log('[FAIL] Could not identify the entry module in index.html.', 'red');
		log('  The waterfall assertion cannot run, and a check that did not run must', 'yellow');
		log('  never be reported as one that passed.', 'yellow');
		return 1;
	}
	const reactChunk = findReactRuntimeChunk();
	let runtimeOk = true;

	if (!reactChunk) {
		log(
			'[FAIL] Could not locate the React runtime in any chunk — update REACT_RUNTIME_MARKERS.',
			'red',
		);
		runtimeOk = false;
	} else if (!criticalNames.includes(reactChunk)) {
		log(
			`[FAIL] React runtime lives in ${reactChunk}, which index.html does not preload.`,
			'red',
		);
		log('  It will be discovered only after the entry chunk is parsed, costing a', 'yellow');
		log('  round trip on every page load. Check the codeSplitting groups in', 'yellow');
		log(
			'  frontend/vite.config.ts — react/react-dom must land in a preloaded chunk.',
			'yellow',
		);
		runtimeOk = false;
	} else {
		log(`[OK] React runtime is in ${reactChunk}, which is preloaded`, 'green');
	}

	// --- Check 3: no static import of a chunk the browser was not told to preload ---
	let waterfallOk = true;
	{
		const late = staticImportsOf(entryName).filter((dep) => !criticalNames.includes(dep));
		if (late.length > 0) {
			log(
				`[FAIL] Entry chunk statically imports ${late.length} non-preloaded chunk(s):`,
				'red',
			);
			for (const dep of late) log(`    ${dep}`, 'red');
			log(
				'  A static import that is not preloaded is a serialized round trip: the',
				'yellow',
			);
			log('  browser cannot request it until it has parsed the entry chunk.', 'yellow');
			waterfallOk = false;
		} else {
			log('[OK] Entry chunk statically imports only preloaded chunks', 'green');
		}
	}

	if (!budgetOk || !runtimeOk || !waterfallOk) {
		log('\n[FAIL] Critical-path verification failed\n', 'red');
		return 1;
	}
	log(
		`\n[OK] Critical-path verification passed (${assets.length} blocking asset(s) examined)\n`,
		'green',
	);
	return 0;
}

if (import.meta.main) {
	// `--update-budget` rewrites the recorded ceiling, so a mistyped flag must not be swallowed:
	// under the old `argv.includes` scan `--update-budgets` simply checked against the old budget
	// and reported a pass. Exit 2 keeps that apart from a real overrun.
	let updateBudget = false;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { 'update-budget': { type: 'boolean' } },
			strict: true,
		});
		updateBudget = values['update-budget'] === true;
	} catch (err) {
		console.error(`[FAIL] check-critical-path: ${(err as Error).message}`);
		console.error('Usage: check-critical-path [--update-budget]');
		exit(2);
	}
	exit(runCriticalPath(updateBudget));
}
