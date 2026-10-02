#!/usr/bin/env bun
/**
 * Crawl Route Coverage Check
 *
 * Enforces: every authenticated page the frontend router registers is either a route the release
 * capture requires the crawl to visit (`.screenshot-capture`) or a named exemption with a reason.
 * No assertion ID: the catalog states no invariant over crawl coverage.
 *
 * The crawler discovers routes by following anchors. A page reached only through a button that
 * calls `navigate()`, or only when a record exists that a fresh database does not hold, is never
 * visited, and nothing compared what was crawled with what the router registers, so the gap was
 * silent: `/workspaces/:id/settings` and its three tabs had never been crawled by any smoke mode.
 *
 * This reads the route tables as source (see lib/router-paths.ts) and compares them with the
 * capture contract. It does not run a crawl; the release capture is what proves a required route
 * was actually visited.
 *
 * Template-only: a derived app registers its own pages and keeps its own capture contract.
 *
 * Usage:
 *   bun scripts/check-crawl-route-coverage.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import { projectRoot } from '../backend/src/config/configUtils.ts';
import { routerPaths } from './lib/router-paths.ts';

/** Pages the crawl cannot be required to visit, each with the reason it cannot. */
const EXEMPT: Record<string, string> = {
	'/dashboards/:id':
		'needs an existing dashboard; a fresh database has none and the read-only crawl creates none',
};

/**
 * Every way the router and the capture contract disagree.
 * @param pages - Page routes the router registers, parameters spelled `:name`
 * @param required - Route patterns the capture contract requires the crawl to visit
 * @param exempt - Pages excused from the contract, each with its reason
 * @returns One line per problem; empty when the two agree
 */
export function crawlCoverageProblems(
	pages: string[],
	required: string[],
	exempt: Record<string, string>,
): string[] {
	const problems: string[] = [];
	if (pages.length === 0) problems.push('No route was read from the router: the scan is broken.');

	for (const page of pages) {
		// A parameter stands for any id; `1` is as good as another for matching a pattern.
		const concrete = page.replace(/:[A-Za-z]+/g, '1');
		const isRequired = required.some((route) => new RegExp(`^(?:${route})$`).test(concrete));
		const isExempt = exempt[page] !== undefined;
		if (!isRequired && !isExempt) {
			problems.push(
				`${page} is registered in the router but the crawl is not required to visit it. ` +
					'Add it to .screenshot-capture, or to EXEMPT in this script with the reason.',
			);
		}
		if (isRequired && isExempt) {
			problems.push(`${page} is both required and exempt; remove the stale exemption.`);
		}
	}
	for (const page of Object.keys(exempt)) {
		if (!pages.includes(page)) problems.push(`Exemption ${page} names no registered route.`);
	}
	return problems;
}

export function runCrawlRouteCoverage(): number {
	const routesDir = join(projectRoot, 'frontend', 'src', 'routes');
	const contract = JSON.parse(readFileSync(join(projectRoot, '.screenshot-capture'), 'utf8')) as {
		routes: string[];
	};
	const pages = [
		...routerPaths(join(routesDir, 'routeGroups.tsx')),
		...routerPaths(join(routesDir, 'settingsRoutes.tsx'), '/settings'),
	];

	const problems = crawlCoverageProblems(pages, contract.routes, EXEMPT);
	if (problems.length > 0) {
		console.error('[FAIL] Crawl route coverage:');
		for (const problem of problems) console.error(` - ${problem}`);
		return 1;
	}
	console.log(
		`[OK] Crawl route coverage: ${String(pages.length)} router page(s) examined, ` +
			`${String(Object.keys(EXEMPT).length)} exempt with a reason.`,
	);
	return 0;
}

if (import.meta.main) {
	exit(runCrawlRouteCoverage());
}
