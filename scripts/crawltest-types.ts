/**
 * Type definitions and constants for crawltest.
 */
import type { Page } from 'puppeteer';

// ---------------------------------------------------------------------------
// Skip patterns — destructive or state-changing actions the crawler must avoid
// ---------------------------------------------------------------------------

/**
 * Number of routes to test before recycling the browser instance.
 * Puppeteer's CDP connection degrades after ~60+ routes of interaction testing
 * due to accumulated execution contexts, event listeners, and stale DOM refs.
 */
export const BROWSER_RECYCLE_INTERVAL = 15;

export const SKIP_PATTERNS: RegExp[] = [
	/^logout$/i,
	/^sign.?out$/i,
	/^delete/i,
	/^remove/i,
	/^destroy/i,
	/^revoke/i,
	/^deactivate/i,
	/^disable/i,
	/^save/i,
	/^submit/i,
	/^create/i,
	/^update/i,
	/^send/i,
	/^import/i,
	/^export/i,
	/^mark all/i,
	/^confirm/i,
	/^apply/i,
	/^change password/i,
	/^generate/i,
	/^upload/i,
	/^new dashboard/i,
	/^from template/i,
	/^add widget/i,
	/^share/i,
	/^rename/i,
	/^acknowledge/i,
	/^resolve/i,
	/^cleanup/i,
	/^trigger/i,
	/\d+ widgets?$/i,
];

export const AUTH_PATH_PATTERNS: RegExp[] = [
	/^\/login/,
	/^\/forgot-password/,
	/^\/reset-password/,
	/^\/auth\//,
];

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface ErrorEntry {
	details: Record<string, unknown>;
	message: string;
	timestamp: string;
	type: string;
}

export interface ConsoleErrorEntry {
	message: string;
	timestamp: string;
	url: string;
}

export interface ConsoleWarningEntry {
	message: string;
	timestamp: string;
	url: string;
}

/**
 * Warning patterns from third-party libraries and browser internals that are
 * not actionable by app code. Matched against the console message text.
 */
export const IGNORED_WARNING_PATTERNS: RegExp[] = [
	/installHook\.js/i,
	/Download the React DevTools/i,
	/React does not recognize the .* prop/i,
	/Cannot update a component .* while rendering a different component/i,
	/findDOMNode is deprecated/i,
	/componentWillMount has been renamed/i,
	/componentWillReceiveProps has been renamed/i,
	/componentWillUpdate has been renamed/i,
	/Each child in a list should have a unique "key" prop/i,
	/browser\.runtime\.connect/i,
	/Extension context invalidated/i,
	/chrome-extension:\/\//i,
	/moz-extension:\/\//i,
	/WebSocket is closed before the connection is established/i,
];

export interface NetworkErrorEntry {
	status: number | string;
	statusText: string;
	timestamp: string;
	url: string;
}

export interface ClickedElementEntry {
	action: string;
	error: null | string;
	selector: string;
	success: boolean;
	timestamp: string;
	url: string;
}

export interface WebVitalEntry {
	name: string;
	navigationType: string;
	rating: string;
	timestamp: string;
	url: string;
	value: number;
}

export interface ContentAssertionEntry {
	hasContent: boolean;
	hasHeading: boolean;
	is404Page: boolean;
	isErrorPage: boolean;
	textLength: number;
	timestamp: string;
	url: string;
}

export type InteractionType = 'button' | 'dialog-trigger' | 'link' | 'select' | 'switch';

export interface InteractiveElement {
	ariaLabel?: string | undefined;
	elementId?: string | undefined;
	href?: string | undefined;
	index: number;
	text: string;
	type: InteractionType;
}

export interface ReportSummary {
	consoleErrors: number;
	consoleWarnings: number;
	contentAssertions: number;
	contentFailures: number;
	dialogsTested: number;
	duration: string;
	elementsClicked: number;
	failedClicks: number;
	networkErrors: number;
	routesDiscovered: number;
	screenshotsTaken: number;
	selectsTested: number;
	success: boolean;
	switchesTested: number;
	totalErrors: number;
	urlsVisited: number;
	webVitalsCount: number;
}

export interface CrawlReport {
	clickedElements: ClickedElementEntry[];
	consoleErrors: ConsoleErrorEntry[];
	consoleWarnings: ConsoleWarningEntry[];
	contentAssertions: ContentAssertionEntry[];
	errors: ErrorEntry[];
	networkErrors: NetworkErrorEntry[];
	summary: ReportSummary;
	visitedUrls: string[];
	webVitals: WebVitalEntry[];
}

export interface CrawlerOptions {
	contentMinLength?: number;
	interactionDelay?: number;
	maxDepth?: number;
	page?: null | string;
	pageSettleDelay?: number;
	screenshotDir?: null | string;
	seedRoutes?: string[];
	startFrom?: null | string;
	test404?: boolean;
	testBug?: boolean;
	timeout?: number;
}

// ---------------------------------------------------------------------------
// Shared context for extracted modules
// ---------------------------------------------------------------------------

export interface CrawlerOpts {
	baseUrl: string;
	contentMinLength: number;
	interactionDelay: number;
	loginCredentials: { email: string; password: string } | null;
	pageSettleDelay: number;
	screenshotDir: null | string;
	timeout: number;
}

export interface CrawlerState {
	cleaningUp: boolean;
	consecutiveScreenshotFailures: number;
	createdTestDashboardId: null | number;
	csrfToken: null | string;
	navigationCount: number;
	screenshotDirCreated: boolean;
	testing404: boolean;
}

// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

export async function waitForContent(page: Page, settleDelay: number): Promise<void> {
	await Bun.sleep(settleDelay);
	try {
		// Wait for meaningful content beyond layout chrome (headers + nav tabs ≈ 100 chars).
		// Falls back after 5s — pages with no data may genuinely have sparse content.
		await page.waitForFunction(
			() => {
				const main = document.querySelector('main');
				const text = (main ?? document.body).innerText ?? '';
				const len = text.trim().length;
				// Accept >100 chars (past layout header) OR no loading skeletons visible
				if (len > 100) return true;
				const hasSkeletons =
					document.querySelector('[class*="skeleton"], [class*="Skeleton"]') !== null;
				return len > 10 && !hasSkeletons;
			},
			{ timeout: 5000 }
		);
	} catch {
		// Timeout is acceptable — page may genuinely have sparse content
	}
}

export function isOnLoginPage(page: Page): boolean {
	const pathname = new URL(page.url()).pathname;
	return pathname === '/login';
}
