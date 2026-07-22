/**
 * Page event handlers for crawltest: console messages, page errors,
 * failed requests, and HTTP error responses.
 */
import type { ConsoleMessage, HTTPRequest, HTTPResponse, Page } from 'puppeteer';

import type { TestResults } from './crawltest-results';
import type { CrawlerState } from './crawltest-types';

import { IGNORED_WARNING_PATTERNS } from './crawltest-types';

// ---------------------------------------------------------------------------
// Event context — read fresh at event time via a getter callback
// ---------------------------------------------------------------------------

export interface CrawlEventContext {
	isLoggedIn: boolean;
	loginCredentials: { email: string; password: string } | null;
	page: null | Page;
	results: TestResults;
	state: CrawlerState;
}

export function attachPageHandlers(page: Page, getCtx: () => CrawlEventContext): void {
	page.on('console', (msg) => handleConsoleMessage(getCtx(), msg));
	page.on('pageerror', (err: unknown) => handlePageError(getCtx(), err));
	page.on('requestfailed', (req) => handleRequestFailed(getCtx(), req));
	page.on('response', (res) => handleResponse(getCtx(), res));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function isIgnoredUrl(url: string): boolean {
	return (
		url.includes('.map') ||
		url.includes('/src/') ||
		url.includes('/@') ||
		url.includes('node_modules') ||
		url.includes('favicon.ico')
	);
}

function handleConsoleMessage(ctx: CrawlEventContext, msg: ConsoleMessage): void {
	if (!ctx.page) return;
	const type = msg.type();
	const text = msg.text();

	if ((type === 'log' || type === 'debug') && text.startsWith('[Web Vitals] ')) {
		try {
			const data = JSON.parse(text.substring('[Web Vitals] '.length)) as Record<
				string,
				unknown
			>;
			ctx.results.addWebVital({
				name: data.name as string,
				navigationType: data.navigationType as string,
				rating: data.rating as string,
				timestamp: new Date().toISOString(),
				url: ctx.page.url(),
				value: data.value as number,
			});
		} catch {
			console.log(`⚠️  Failed to parse Web Vitals: ${text}`);
		}
		return;
	}

	if (type === 'warn') {
		if (IGNORED_WARNING_PATTERNS.some((p) => p.test(text))) return;
		ctx.results.addConsoleWarning(text, ctx.page.url());
		console.log(`⚠️  Console Warning: ${text}`);
		return;
	}

	if (type === 'error') {
		if (
			!ctx.isLoggedIn &&
			(text.includes('401 (Unauthorized)') || text.includes('API Error: 401'))
		) {
			return;
		}
		if (text.includes('[Web Vitals]')) return;
		if (text.includes('favicon.ico') || text.includes('Failed to load resource')) return;
		if (text.includes('Content Security Policy') && text.includes('data:font/')) return;

		ctx.results.addConsoleError(text, ctx.page.url());
		console.log(`❌ Console Error: ${text}`);
	}
}

function handlePageError(ctx: CrawlEventContext, err: unknown): void {
	const error = err as Error;
	// WebSocket reconnection noise during rapid crawl navigation — not a real error
	if (error.message?.includes('send was called before connect')) return;
	if (ctx.page) {
		ctx.results.addError('PAGE_ERROR', error.message, {
			stack: error.stack,
			url: ctx.page.url(),
		});
	}
	console.log(`❌ Page Error: ${error.message}`);
}

function handleRequestFailed(ctx: CrawlEventContext, request: HTTPRequest): void {
	const url = request.url();
	if (isIgnoredUrl(url)) return;
	if (url.startsWith('data:')) return;

	const failure = request.failure();
	if (failure && failure.errorText === 'net::ERR_ABORTED') return;

	ctx.results.addNetworkError(url, failure?.errorText ?? 'Unknown', 'Request Failed');
	console.log(`❌ Network Error: ${url} - ${failure?.errorText}`);
}

function handleResponse(ctx: CrawlEventContext, response: HTTPResponse): void {
	const url = response.url();
	if (isIgnoredUrl(url)) return;

	// Capture CSRF token from login response for use in ensureTestDashboard/cleanupTestData
	if (url.includes('/auth/login') && response.status() === 200) {
		const csrf = response.headers()['x-csrf-token'];
		if (csrf) {
			ctx.state.csrfToken = csrf;
		}
	}

	if (response.status() >= 400) {
		if (!ctx.isLoggedIn && response.status() === 401) return;
		if (response.status() === 401 && ctx.loginCredentials) return;
		if (ctx.state.testing404 && response.status() === 404) return;
		if (ctx.state.cleaningUp) return;
		if (response.status() === 429) return;
		if (response.status() === 403 && url.includes('/auth/demo-accounts')) return;
		// rotate-backup-key returns 400 when no rotation is staged (the default
		// state) — the click-discovery walks the SYSOP rotate button and the
		// validator response is intentional UX, not a regression.
		if (
			response.status() === 400 &&
			url.includes('/settings/auth-security/rotate-backup-key')
		) {
			return;
		}

		ctx.results.addNetworkError(url, response.status(), response.statusText());
		console.log(`❌ HTTP Error: ${response.status()} ${response.statusText()} - ${url}`);
	}
}
