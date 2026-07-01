/**
 * Browser lifecycle management — launch, close, event listeners, viewport.
 *
 * Adapts patterns from crawltest.ts (browser launch args, event handling,
 * protocol timeout, viewport setup).
 */
import type { Browser, Page } from 'puppeteer';

import puppeteer from 'puppeteer';

import type { ConsoleEntry, NetworkErrorEntry, SessionState } from './types';

import {
	BROWSER_LAUNCH_ARGS,
	DEFAULT_VIEWPORT,
	IGNORED_WARNING_PATTERNS,
	PROTOCOL_TIMEOUT,
} from './types';

// ---------------------------------------------------------------------------
// Browser session — holds browser + page + buffered events
// ---------------------------------------------------------------------------

export interface BrowserSession {
	browser: Browser;
	page: Page;
	state: SessionState;
}

/** Launch a new headless browser and create a page with event listeners. */
export async function launchBrowser(sessionName: string): Promise<BrowserSession> {
	const browser = await puppeteer.launch({
		args: [...BROWSER_LAUNCH_ARGS],
		headless: true,
		protocolTimeout: PROTOCOL_TIMEOUT,
	});

	const page = await browser.newPage();
	await page.setViewport(DEFAULT_VIEWPORT);

	const state: SessionState = {
		consoleEntries: [],
		currentUrl: 'about:blank',
		networkErrors: [],
		refs: [],
		sessionName,
		viewport: { ...DEFAULT_VIEWPORT },
	};

	attachEventListeners(page, state);

	return { browser, page, state };
}

/** Close browser and clean up. */
export async function closeBrowser(session: BrowserSession): Promise<void> {
	try {
		await session.browser.close();
	} catch {
		// Force-kill if close fails
		const proc = session.browser.process();
		if (proc?.pid) {
			try {
				process.kill(proc.pid, 'SIGKILL');
			} catch {
				// Already dead
			}
		}
	}
}

/** Set viewport size on the active page. */
export async function setViewport(
	session: BrowserSession,
	width: number,
	height: number
): Promise<void> {
	await session.page.setViewport({ height, width });
	session.state.viewport = { height, width };
}

// ---------------------------------------------------------------------------
// Event listeners — continuous capture of console + network errors
// ---------------------------------------------------------------------------

function attachEventListeners(page: Page, state: SessionState): void {
	page.on('console', (msg) => {
		const type = msg.type();
		const text = msg.text();

		// Skip ignored warnings
		if (IGNORED_WARNING_PATTERNS.some((p) => p.test(text))) return;

		if (type === 'error') {
			state.consoleEntries.push({
				level: 'error',
				text,
				timestamp: new Date().toISOString(),
				url: page.url(),
			});
		} else if (type === 'warn') {
			state.consoleEntries.push({
				level: 'warning',
				text,
				timestamp: new Date().toISOString(),
				url: page.url(),
			});
		}
	});

	page.on('pageerror', (err: unknown) => {
		const message = err instanceof Error ? err.message : String(err);
		state.consoleEntries.push({
			level: 'error',
			text: `Uncaught: ${message}`,
			timestamp: new Date().toISOString(),
			url: page.url(),
		});
	});

	page.on('requestfailed', (req) => {
		const failure = req.failure();
		if (!failure) return;
		// Skip aborted requests (normal browser behavior)
		if (failure.errorText === 'net::ERR_ABORTED') return;

		state.networkErrors.push({
			status: failure.errorText,
			statusText: 'request failed',
			timestamp: new Date().toISOString(),
			url: req.url(),
		});
	});

	page.on('response', (res) => {
		const status = res.status();
		if (status >= 400) {
			const url = res.url();
			// Skip static assets and favicon 404s
			if (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.ico')) return;

			state.networkErrors.push({
				status,
				statusText: res.statusText(),
				timestamp: new Date().toISOString(),
				url,
			});
		}
	});
}

// ---------------------------------------------------------------------------
// Console / error retrieval
// ---------------------------------------------------------------------------

/** Get buffered console entries, optionally filtering by level. */
export function getConsoleEntries(
	state: SessionState,
	level?: 'error' | 'warning'
): ConsoleEntry[] {
	if (level) return state.consoleEntries.filter((e) => e.level === level);
	return state.consoleEntries;
}

/** Get buffered network errors. */
export function getNetworkErrors(state: SessionState): NetworkErrorEntry[] {
	return state.networkErrors;
}

/** Clear buffered console entries and network errors. */
export function clearBuffers(state: SessionState): void {
	state.consoleEntries.length = 0;
	state.networkErrors.length = 0;
}
