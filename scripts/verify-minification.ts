#!/usr/bin/env bun
/**
 * Minification Verification Script
 *
 * Inspects the actual frontend build output (frontend/dist/assets) and fails when:
 *   - frontend/dist is missing (run `bun run build:frontend` first)
 *   - any JS asset looks unminified (average line length below the heuristic
 *     threshold for files larger than 5 KB)
 *   - the total bundle size exceeds the budget in scripts/bundle-budget.json
 *
 * The budget is per-app generated state, so it is only enforced when it was measured from THIS
 * app's build (see scripts/lib/bundle-budget.ts for the provenance rule).
 *
 * Regenerate the budget after intentional bundle growth:
 *   bun scripts/verify-minification.ts --update-budget
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateBundleBudget, kb, writeBundleBudget } from './lib/bundle-budget.ts';
import { getAppSlug } from './load-json-config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'frontend', 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const BUDGET_PATH = join(__dirname, 'bundle-budget.json');

/** Files >5KB with an average line length below this look unminified. */
const MIN_AVG_LINE_LENGTH = 200;
const MINIFY_CHECK_MIN_BYTES = 5 * 1024;

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

interface AssetInfo {
	avgLineLength: number;
	name: string;
	sizeBytes: number;
	type: 'css' | 'js';
}

function rawAvgLineLength(content: string): number {
	const lines = content.split('\n').filter((l) => l.length > 0);
	return lines.length > 0 ? content.length / lines.length : 0;
}

/**
 * Average line length is a proxy for "did the minifier run", but it misreads any chunk that embeds
 * multi-line content. In valid JS a RAW newline can only occur inside a template literal — single
 * and double quoted strings cannot span lines, and minifiers strip comments — so a minified chunk
 * carrying markdown, SVG, or SQL in backticks is full of newlines the minifier could not remove and
 * scores identically to unminified source. aidd hit exactly this: a minified docs chunk with 583 of
 * its 584 newlines inside template literals scored 57 against a threshold of 200.
 *
 * Measuring only the code OUTSIDE template literals is what the heuristic always meant to measure.
 */
function codeAvgLineLength(content: string): number {
	let inTemplate = false;
	let chars = 0;
	let lines = 1;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		// Skip the escaped character wholesale so an escaped backtick cannot flip the state.
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '`') {
			inTemplate = !inTemplate;
			continue;
		}
		if (inTemplate) continue;
		chars++;
		if (ch === '\n') lines++;
	}

	return chars / lines;
}

async function collectAssets(dir: string, found: AssetInfo[] = []): Promise<AssetInfo[]> {
	for (const entry of await readdir(dir)) {
		const fullPath = join(dir, entry);
		const stats = await stat(fullPath);
		if (stats.isDirectory()) {
			await collectAssets(fullPath, found);
			continue;
		}
		const isJs = entry.endsWith('.js');
		const isCss = entry.endsWith('.css');
		if (!isJs && !isCss) continue; // skips .gz/.br/.map siblings

		const content = readFileSync(fullPath, 'utf-8');
		const avgLineLength = isJs ? codeAvgLineLength(content) : rawAvgLineLength(content);
		found.push({
			avgLineLength,
			name: entry,
			sizeBytes: stats.size,
			type: isJs ? 'js' : 'css',
		});
	}
	return found;
}

function checkBudget(totalJs: number, totalCss: number, updateBudget: boolean): boolean {
	const input = {
		appSlug: getAppSlug(ROOT_DIR),
		budgetPath: BUDGET_PATH,
		totalCssBytes: totalCss,
		totalJsBytes: totalJs,
	};
	const result = updateBudget ? writeBundleBudget(input) : evaluateBundleBudget(input);
	for (const line of result.lines) log(line.text, line.color);
	return result.ok;
}

async function main(): Promise<void> {
	const updateBudget = process.argv.includes('--update-budget');

	log('\n=== Minification Verification ===\n', 'blue');

	if (!existsSync(ASSETS_DIR)) {
		log('✗ frontend/dist/assets not found — build the frontend first:', 'red');
		log('  bun run build:frontend', 'yellow');
		process.exit(1);
	}

	const assets = await collectAssets(ASSETS_DIR);
	if (assets.length === 0) {
		log('✗ No JS/CSS assets found in frontend/dist/assets', 'red');
		process.exit(1);
	}

	assets.sort((a, b) => b.sizeBytes - a.sizeBytes);

	const unminified: AssetInfo[] = [];
	for (const asset of assets) {
		const suspicious =
			asset.type === 'js' &&
			asset.sizeBytes > MINIFY_CHECK_MIN_BYTES &&
			asset.avgLineLength < MIN_AVG_LINE_LENGTH;
		if (suspicious) unminified.push(asset);
		log(
			`${asset.name.padEnd(45)} ${kb(asset.sizeBytes).padStart(12)}  (avg line ${Math.round(asset.avgLineLength)})`,
			suspicious ? 'red' : 'reset',
		);
	}

	const totalJs = assets.filter((a) => a.type === 'js').reduce((s, a) => s + a.sizeBytes, 0);
	const totalCss = assets.filter((a) => a.type === 'css').reduce((s, a) => s + a.sizeBytes, 0);

	log('\n=== Totals ===\n', 'cyan');
	log(`JS:  ${kb(totalJs)} across ${assets.filter((a) => a.type === 'js').length} files`);
	log(`CSS: ${kb(totalCss)} across ${assets.filter((a) => a.type === 'css').length} files`);

	const budgetOk = checkBudget(totalJs, totalCss, updateBudget);

	if (unminified.length > 0) {
		log(`\n✗ ${unminified.length} JS asset(s) look unminified:`, 'red');
		for (const a of unminified) {
			log(
				`  ${a.name}: ${kb(a.sizeBytes)}, avg line length ${Math.round(a.avgLineLength)} < ${MIN_AVG_LINE_LENGTH}`,
				'red',
			);
		}
		log('Check frontend/vite.config.ts build.minify settings.', 'yellow');
	}

	if (unminified.length > 0 || !budgetOk) {
		log('\n✗ Minification verification FAILED\n', 'red');
		process.exit(1);
	}

	log('\n✓ Minification verification passed\n', 'green');
}

main().catch((error: unknown) => {
	log(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, 'red');
	process.exit(1);
});
