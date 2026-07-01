import type { Page } from 'puppeteer';

/**
 * WebCrawler — orchestrates the crawltest run: discovery, per-route visits,
 * browser recycling, special-page tests, and cleanup.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CrawlEventContext } from './crawltest-events';
import type { CrawlSession } from './crawltest-session';
import type { CrawlerOpts, CrawlerOptions, CrawlerState } from './crawltest-types';

import { discoverRoutes } from './crawltest-discovery';
import { attachPageHandlers } from './crawltest-events';
import {
	cleanupTestData,
	ensureTestDashboard,
	test404Page,
	testBugReport,
} from './crawltest-pages';
import { TestResults } from './crawltest-results';
import {
	flushRateLimits,
	launchSession,
	loginSession,
	navigateSessionToStart,
	recycleBrowser,
	screenshotPreLoginPages,
} from './crawltest-session';
import { BROWSER_RECYCLE_INTERVAL } from './crawltest-types';
import { visitRoute } from './crawltest-visit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export class WebCrawler {
	private baseUrl: string;
	private contentMinLength: number;
	private interactionDelay: number;
	private maxDepth: number;
	private pageSettleDelay: number;
	private results: TestResults;
	private screenshotDir: null | string;
	private seedRoutes: string[];
	private session: CrawlSession;
	private singlePage: null | string;
	private startFromRoute: null | string;
	private state: CrawlerState;
	private test404Flag: boolean;
	private testBugFlag: boolean;
	private timeout: number;

	constructor(baseUrl: string, options: CrawlerOptions = {}) {
		this.baseUrl = baseUrl;
		this.maxDepth = options.maxDepth ?? 3;
		this.timeout = options.timeout ?? 30000;
		this.interactionDelay = options.interactionDelay ?? 400;
		this.pageSettleDelay = options.pageSettleDelay ?? 500;
		this.contentMinLength = options.contentMinLength ?? 50;
		this.screenshotDir = options.screenshotDir ?? null;
		this.seedRoutes = options.seedRoutes ?? [];
		this.singlePage = options.page ?? null;
		this.startFromRoute = options.startFrom ?? null;
		this.test404Flag = options.test404 ?? false;
		this.testBugFlag = options.testBug ?? false;
		this.results = new TestResults();
		this.session = {
			browser: null,
			isLoggedIn: false,
			loginCredentials: null,
			page: null,
			reLoginFailed: false,
		};
		this.state = {
			cleaningUp: false,
			consecutiveScreenshotFailures: 0,
			createdTestDashboardId: null,
			csrfToken: null,
			navigationCount: 0,
			screenshotDirCreated: false,
			testing404: false,
		};
	}

	// -----------------------------------------------------------------------
	// Shared context accessors
	// -----------------------------------------------------------------------

	private get opts(): CrawlerOpts {
		return {
			baseUrl: this.baseUrl,
			contentMinLength: this.contentMinLength,
			interactionDelay: this.interactionDelay,
			loginCredentials: this.session.loginCredentials,
			pageSettleDelay: this.pageSettleDelay,
			screenshotDir: this.screenshotDir,
			timeout: this.timeout,
		};
	}

	private get eventCtx(): CrawlEventContext {
		return {
			isLoggedIn: this.session.isLoggedIn,
			loginCredentials: this.session.loginCredentials,
			page: this.session.page,
			results: this.results,
			state: this.state,
		};
	}

	private attach = (page: Page): void => {
		attachPageHandlers(page, () => this.eventCtx);
	};

	private recycle = (): Promise<boolean> => {
		return recycleBrowser(this.session, this.opts, this.attach);
	};

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	async init(): Promise<void> {
		console.log('🚀 Launching browser...');
		await launchSession(this.session, this.attach);
	}

	async close(): Promise<void> {
		if (this.session.browser) {
			await this.session.browser.close();
		}
	}

	getResults(): TestResults {
		return this.results;
	}

	async screenshotPreLoginPages(): Promise<void> {
		await screenshotPreLoginPages(this.session, this.results, this.opts, this.state);
	}

	async login(email: string, password: string): Promise<void> {
		await loginSession(this.session, this.results, this.opts, email, password);
	}

	async navigateToStart(): Promise<void> {
		await navigateSessionToStart(this.session, this.results, this.opts);
	}

	// -----------------------------------------------------------------------
	// Main crawl orchestrator
	// -----------------------------------------------------------------------

	async crawl(): Promise<void> {
		if (!this.session.page) return;

		// Phase 0: Ensure test data exists for parameterized routes (only when logged in)
		if (this.session.isLoggedIn) {
			await ensureTestDashboard(this.session.page, this.state);
		}

		let routes: string[];

		if (this.singlePage) {
			routes = [`${this.baseUrl}${this.singlePage}`];
			this.results.routesDiscovered = 1;
			console.log(`\n📍 Single page mode: testing ${this.singlePage}\n`);
		} else {
			routes = await discoverRoutes(
				this.session.page,
				this.opts,
				this.seedRoutes,
				this.maxDepth,
				flushRateLimits
			);

			if (this.startFromRoute) {
				const filtered = routes.filter((url) => {
					const pathname = new URL(url).pathname;
					return pathname.startsWith(this.startFromRoute!);
				});

				if (filtered.length === 0) {
					console.log(
						`\n⚠️  No routes found starting from "${this.startFromRoute}". Discovered routes:`
					);
					for (const r of routes) {
						console.log(`   ${new URL(r).pathname}`);
					}
					this.results.routesDiscovered = routes.length;
					if (this.session.page) await cleanupTestData(this.session.page, this.state);
					return;
				}

				console.log(
					`\n📍 Discovered ${routes.length} routes, filtered to ${filtered.length} starting from "${this.startFromRoute}"\n`
				);
				this.results.routesDiscovered = routes.length;
				routes = filtered;
			} else {
				this.results.routesDiscovered = routes.length;
				console.log(`\n📍 Discovered ${routes.length} routes to test\n`);
			}
		}

		// Phase 2: Visit each route with full element testing
		for (const [i, route] of routes.entries()) {
			if (i > 0 && this.state.navigationCount >= BROWSER_RECYCLE_INTERVAL) {
				await this.recycle();
				this.state.navigationCount = 0;
			} else if (this.state.consecutiveScreenshotFailures >= 2) {
				console.log('   ⚠️  Multiple screenshot failures — forcing browser recycle');
				await this.recycle();
				this.state.consecutiveScreenshotFailures = 0;
				this.state.navigationCount = 0;
			}
			await visitRoute(
				this.session,
				this.results,
				this.opts,
				this.state,
				ROOT_DIR,
				route,
				this.recycle
			);
		}

		// Phase 2b: Test 404 page (if --404 flag is set)
		if (this.test404Flag && this.session.page) {
			await test404Page(this.session.page, this.results, this.opts, this.state, ROOT_DIR);
		}

		// Phase 2c: Test bug report submission (if --bug flag is set)
		if (this.testBugFlag && this.session.page) {
			await testBugReport(this.session.page, this.results, this.opts, this.state, ROOT_DIR);
		}

		// Phase 3: Flush web vitals
		await this.flushWebVitals();

		// Phase 4: Cleanup test data
		if (this.session.page) await cleanupTestData(this.session.page, this.state);
	}

	// -----------------------------------------------------------------------
	// Web Vitals flush
	// -----------------------------------------------------------------------

	private async flushWebVitals(): Promise<void> {
		if (!this.session.page) return;

		try {
			await this.session.page.evaluate(() => {
				document.dispatchEvent(new Event('visibilitychange'));
			});
			await Bun.sleep(500);
		} catch {
			// Page context may have been destroyed after a failed navigation
		}
	}
}
