import type { Metric } from 'web-vitals';

import { getCommonHeaders, getCsrfHeader } from '@/api/requestHelpers';

interface VitalMetric {
	name: string;
	navigationType: string;
	rating: string;
	value: number;
}

interface VitalsBatch {
	metrics: VitalMetric[];
	timestamp: string;
	url: string;
}

/** A metric plus the route it was reported from, before batching splits them by route. */
interface BufferedMetric extends VitalMetric {
	route: string;
}

let buffer: BufferedMetric[] = [];
let flushTimer: null | ReturnType<typeof setTimeout> = null;

const FLUSH_INTERVAL_MS = 10_000;

/** Replace dynamic path segments (IDs, UUIDs, tokens) with placeholders. */
function sanitizePathname(pathname: string): string {
	return pathname
		.replace(/\/\d+/g, '/:id')
		.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
		.replace(/\/[A-Za-z0-9_-]{20,}/g, '/:token');
}

/** The route as it stands right now, sanitized the same way the batch url is. */
function currentRoute(): string {
	return sanitizePathname(window.location.pathname);
}

function flushBuffer(): void {
	if (buffer.length === 0) return;

	// One request per route. The buffer collects for ten seconds and a single-page app can
	// change route several times inside that window, so a batch that carried one url filed
	// every metric in it under whichever route the flush timer happened to land on. Grouping
	// here keeps the wire format unchanged while making the url it carries true for every
	// metric in the batch.
	const byRoute = new Map<string, VitalMetric[]>();
	for (const { route, ...metric } of buffer) {
		const metrics = byRoute.get(route);
		if (metrics) metrics.push(metric);
		else byRoute.set(route, [metric]);
	}
	buffer = [];

	const timestamp = new Date().toISOString();
	for (const [url, metrics] of byRoute) {
		const batch: VitalsBatch = { metrics, timestamp, url };

		// Fire-and-forget — don't block the main thread
		void fetch('/api/v1/system/web-vitals', {
			body: JSON.stringify(batch),
			credentials: 'include',
			headers: { ...getCommonHeaders(), ...getCsrfHeader() },
			keepalive: true,
			method: 'POST',
		}).catch(() => {
			// Silently ignore reporting failures
		});
	}
}

function onMetric(metric: Metric): void {
	const rounded = Math.round(metric.value * 1000) / 1000;
	// Read the route now, not at flush time. CLS and INP are page-session metrics that keep
	// reporting as the session goes on, so the route has to be captured with each report.
	//
	// Caveat worth knowing before reading INP by route: this is the route the metric was
	// REPORTED from, which for INP is the route the interaction finished on. An interaction
	// that navigates — a login submit, a row that opens a detail page — is reported after the
	// router has already moved, so it lands on the destination route. Attributing it to the
	// route the interaction STARTED on needs `web-vitals/attribution`; until then, read a
	// route's INP as "interactions that ended here", not "interactions that started here".
	const route = currentRoute();

	if (import.meta.env.DEV) {
		console.debug(
			`[Web Vitals] ${JSON.stringify({
				name: metric.name,
				navigationType: metric.navigationType ?? 'unknown',
				rating: metric.rating,
				url: route,
				value: rounded,
			})}`,
		);
		return;
	}

	buffer.push({
		name: metric.name,
		navigationType: metric.navigationType ?? 'unknown',
		rating: metric.rating,
		route,
		value: rounded,
	});

	// Debounce: flush after collecting for a while
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL_MS);
}

/**
 * Initialize web vitals collection.
 * - Dev: logs metrics to console with [Web Vitals] prefix for Puppeteer capture.
 * - Production: batches metrics and POSTs them to the backend, one batch per route.
 */
function initWebVitals(): void {
	void import('web-vitals').then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
		// In dev, use reportAllChanges for CUMULATIVE metrics (CLS, INP) so headless
		// Puppeteer captures intermediate values — these normally only fire on page
		// visibility change / unload and would otherwise be missed by the crawler.
		//
		// SINGLE-SHOT metrics (FCP, LCP, TTFB) must NOT use reportAllChanges: web-vitals
		// finalizes them at first user-input / visibilitychange / pagehide, which gives
		// the stable initial-paint value. With reportAllChanges every interaction-induced
		// LCP candidate (dialog opens, combobox opens, column panels) re-fires onLCP
		// and gets logged, which inflates the per-page worst-case value during automated
		// crawls and produces false 'needs-improvement' / 'poor' ratings.
		const cumulativeOpts = import.meta.env.DEV ? { reportAllChanges: true } : undefined;

		onCLS(onMetric, cumulativeOpts);
		onINP(onMetric, cumulativeOpts);
		onFCP(onMetric);
		onLCP(onMetric);
		onTTFB(onMetric);
	});
}

export { initWebVitals };
