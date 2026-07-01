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

let buffer: VitalsBatch['metrics'] = [];
let flushTimer: null | ReturnType<typeof setTimeout> = null;

const FLUSH_INTERVAL_MS = 10_000;

/** Replace dynamic path segments (IDs, UUIDs, tokens) with placeholders. */
function sanitizePathname(pathname: string): string {
	return pathname
		.replace(/\/\d+/g, '/:id')
		.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
		.replace(/\/[A-Za-z0-9_-]{20,}/g, '/:token');
}

function flushBuffer(): void {
	if (buffer.length === 0) return;

	const batch: VitalsBatch = {
		metrics: [...buffer],
		timestamp: new Date().toISOString(),
		url: sanitizePathname(window.location.pathname),
	};
	buffer = [];

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

function onMetric(metric: Metric): void {
	const rounded = Math.round(metric.value * 1000) / 1000;

	if (import.meta.env.DEV) {
		console.debug(
			`[Web Vitals] ${JSON.stringify({
				name: metric.name,
				navigationType: metric.navigationType ?? 'unknown',
				rating: metric.rating,
				value: rounded,
			})}`
		);
		return;
	}

	buffer.push({
		name: metric.name,
		navigationType: metric.navigationType ?? 'unknown',
		rating: metric.rating,
		value: rounded,
	});

	// Debounce: flush after collecting for a while
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL_MS);
}

/**
 * Initialize web vitals collection.
 * - Dev: logs metrics to console with [Web Vitals] prefix for Puppeteer capture.
 * - Production: batches metrics and POSTs them to the backend.
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
