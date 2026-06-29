#!/usr/bin/env bun
/**
 * Crawltest Analyze Script
 *
 * Reads logs/crawltest.json and surfaces which pages have non-'good' Web Vitals
 * ratings plus the top-N slowest pages by LCP and FCP. Lightweight report, not a
 * quality gate — always exits 0.
 *
 * Usage:
 *   bun scripts/crawltest-analyze.ts
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { CrawlReport } from './crawltest-types';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TOP_N = 5;
const RATING_SCORE: Record<string, number> = {
	good: 0,
	'needs-improvement': 1,
	poor: 2,
};

interface MetricSnapshot {
	name: string;
	rating: string;
	value: number;
}

interface PageIssues {
	issues: MetricSnapshot[];
	page: string;
	worstScore: number;
}

interface SlowEntry {
	page: string;
	rating: string;
	value: number;
}

function isWorse(candidate: MetricSnapshot, existing: MetricSnapshot): boolean {
	const candScore = RATING_SCORE[candidate.rating] ?? 0;
	const existScore = RATING_SCORE[existing.rating] ?? 0;
	if (candScore !== existScore) return candScore > existScore;
	return candidate.value > existing.value;
}

function toPagePath(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname + u.search;
	} catch {
		return url;
	}
}

function flagFor(rating: string): string {
	if (rating === 'good') return '✓';
	if (rating === 'needs-improvement') return '⚠';
	return '✗';
}

function formatValue(name: string, value: number): string {
	const unit = name === 'CLS' ? '' : 'ms';
	const display = name === 'CLS' ? value.toFixed(3) : Math.round(value).toString();
	return `${display}${unit}`;
}

function printTopSlowest(
	byPage: Map<string, Map<string, MetricSnapshot>>,
	metricName: string
): void {
	const entries: SlowEntry[] = [];
	for (const [page, metrics] of byPage) {
		const metric = metrics.get(metricName);
		if (metric) entries.push({ page, rating: metric.rating, value: metric.value });
	}
	if (entries.length === 0) return;
	entries.sort((a, b) => b.value - a.value);
	const top = entries.slice(0, TOP_N);
	console.log(`\n🐢 Slowest pages by ${metricName} (top ${top.length}):`);
	for (const entry of top) {
		console.log(
			`   ${flagFor(entry.rating)} ${formatValue(metricName, entry.value).padStart(7)}  ${entry.page}`
		);
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const reportPath = path.resolve(import.meta.dirname, '..', 'logs', 'crawltest.json');

if (!existsSync(reportPath)) {
	console.log('⚠ No crawltest report found at logs/crawltest.json');
	console.log('  Run `bun run crawltest` first to generate it.');
	process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as CrawlReport;
const ageMs = Date.now() - statSync(reportPath).mtimeMs;

console.log('\n📊 Crawltest Web Vitals Analysis');
console.log(`   Source: ${path.relative(process.cwd(), reportPath)}`);
if (ageMs > STALE_AFTER_MS) {
	const ageHours = Math.round(ageMs / (60 * 60 * 1000));
	console.log(`   ⚠ Report is ${ageHours}h old — consider re-running crawltest`);
}

if (report.webVitals.length === 0) {
	console.log('\n⚠ No Web Vitals entries in crawltest.json');
	process.exit(0);
}

// Group vitals by page path; keep the worst value per metric name per page
const byPage = new Map<string, Map<string, MetricSnapshot>>();
for (const entry of report.webVitals) {
	const page = toPagePath(entry.url);
	let metrics = byPage.get(page);
	if (!metrics) {
		metrics = new Map<string, MetricSnapshot>();
		byPage.set(page, metrics);
	}
	const candidate: MetricSnapshot = {
		name: entry.name,
		rating: entry.rating,
		value: entry.value,
	};
	const existing = metrics.get(entry.name);
	if (!existing || isWorse(candidate, existing)) {
		metrics.set(entry.name, candidate);
	}
}

console.log(`   Pages analyzed: ${byPage.size}`);
console.log(`   Total metric samples: ${report.webVitals.length}`);

// Pages with at least one non-'good' rating
const pagesWithIssues: PageIssues[] = [];
for (const [page, metrics] of byPage) {
	const issues: MetricSnapshot[] = [];
	for (const metric of metrics.values()) {
		if (metric.rating !== 'good') issues.push(metric);
	}
	if (issues.length === 0) continue;
	const worstScore = issues.reduce((acc, m) => Math.max(acc, RATING_SCORE[m.rating] ?? 0), 0);
	pagesWithIssues.push({ issues, page, worstScore });
}

if (pagesWithIssues.length === 0) {
	console.log('\n✅ All pages within Web Vitals "good" thresholds');
} else {
	pagesWithIssues.sort((a, b) => b.worstScore - a.worstScore || a.page.localeCompare(b.page));
	console.log(`\n⚠ Pages with non-'good' ratings (${pagesWithIssues.length}):`);
	for (const { issues, page } of pagesWithIssues) {
		console.log(`\n   ${page}`);
		issues.sort((a, b) => (RATING_SCORE[b.rating] ?? 0) - (RATING_SCORE[a.rating] ?? 0));
		for (const metric of issues) {
			console.log(
				`     ${flagFor(metric.rating)} ${metric.name.padEnd(5)} ${formatValue(metric.name, metric.value)} (${metric.rating})`
			);
		}
	}
}

printTopSlowest(byPage, 'LCP');
printTopSlowest(byPage, 'FCP');

console.log('');
process.exit(0);
