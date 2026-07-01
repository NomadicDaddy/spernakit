/**
 * Browser session management for crawltest: launch, login, start navigation,
 * pre-login screenshots, browser recycling, and rate-limit flushing.
 */
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, CrawlerState } from './crawltest-types';

import { screenshotPage } from './crawltest-screenshots';
import { waitForContent } from './crawltest-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Session state — mutable container shared between crawler and helpers
// ---------------------------------------------------------------------------

export interface CrawlSession {
	browser: Browser | null;
	isLoggedIn: boolean;
	loginCredentials: { email: string; password: string } | null;
	page: null | Page;
	reLoginFailed: boolean;
}

/** Flush rate limit entries so automated crawling isn't throttled by its own traffic. */
export function flushRateLimits(): void {
	try {
		const defaultsPath = path.join(ROOT_DIR, 'backend', 'src', 'config', 'defaults.json');
		const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as {
			app?: { slug?: string };
		};
		const slug = defaults.app?.slug ?? 'app';
		const dbPath = path.join(ROOT_DIR, 'data', `${slug}.db`);
		const db = new Database(dbPath);
		db.run('DELETE FROM rate_limit_entries');
		db.close();
	} catch {
		// DB may not exist yet (fresh setup) — safe to ignore
	}
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

export async function launchSession(
	session: CrawlSession,
	attach: (page: Page) => void
): Promise<void> {
	session.browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
		headless: true,
		protocolTimeout: 120_000,
	});
	session.page = await session.browser.newPage();
	await session.page.setViewport({ height: 1080, width: 1920 });
	attach(session.page);
}

// ---------------------------------------------------------------------------
// Pre-login: screenshot unauthenticated pages before logging in
// ---------------------------------------------------------------------------

export async function screenshotPreLoginPages(
	session: CrawlSession,
	results: TestResults,
	opts: CrawlerOpts,
	state: CrawlerState
): Promise<void> {
	if (!session.page || !opts.screenshotDir) return;

	const preLoginRoutes = ['/register'];
	console.log('📷 Screenshotting pre-login pages...');

	for (const route of preLoginRoutes) {
		const url = `${opts.baseUrl}${route}`;
		try {
			await session.page.goto(url, {
				timeout: opts.timeout,
				waitUntil: 'networkidle2',
			});
			await waitForContent(session.page, opts.pageSettleDelay);
			const ssPath = await screenshotPage(session.page, results, opts, state, ROOT_DIR, url);
			if (ssPath) console.log(`   📸 Screenshot: ${ssPath}`);
		} catch {
			console.log(`   ⚠️  Failed to screenshot ${route}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginSession(
	session: CrawlSession,
	results: TestResults,
	opts: CrawlerOpts,
	email: string,
	password: string
): Promise<void> {
	if (!session.page) throw new Error('Browser not initialized');

	console.log('🔐 Logging in...');
	try {
		console.log(`   Navigating to ${opts.baseUrl}/login...`);
		await session.page.goto(`${opts.baseUrl}/login`, {
			timeout: opts.timeout,
			waitUntil: 'networkidle2',
		});

		console.log('   Waiting for username field...');
		await session.page.waitForSelector('#username', { timeout: 15000 });

		console.log('   Entering credentials...');
		await session.page.type('#username', email, { delay: 10 });
		await session.page.type('#password', password, { delay: 10 });

		console.log('   Clicking submit button...');
		await session.page.click('button[type="submit"]');

		console.log('   Waiting for dashboard redirect...');
		await session.page.waitForFunction(() => location.pathname === '/dashboard', {
			timeout: 20000,
		});

		console.log('   Waiting for dashboard content to render...');
		await waitForContent(session.page, opts.pageSettleDelay);

		console.log('✅ Login successful');
		session.isLoggedIn = true;
		session.loginCredentials = { email, password };
		results.visitedUrls.add(`${opts.baseUrl}/login`);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.log(`❌ Login failed: ${typedErr.message}`);
		if (session.page) {
			console.log(`   Current URL: ${session.page.url()}`);
			try {
				await session.page.screenshot({ path: 'scripts/login-error.png' });
				console.log('   Screenshot saved to scripts/login-error.png');
			} catch {
				// Ignore screenshot errors
			}
		}
		results.addError('LOGIN_ERROR', typedErr.message, { stack: typedErr.stack });
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Navigate to start page (no-login mode)
// ---------------------------------------------------------------------------

export async function navigateSessionToStart(
	session: CrawlSession,
	results: TestResults,
	opts: CrawlerOpts
): Promise<void> {
	if (!session.page) throw new Error('Browser not initialized');

	console.log(`🏠 Navigating to ${opts.baseUrl}/...`);
	await session.page.goto(opts.baseUrl, {
		timeout: opts.timeout,
		waitUntil: 'networkidle2',
	});
	await waitForContent(session.page, opts.pageSettleDelay);
	console.log('✅ Start page loaded');
	results.visitedUrls.add(opts.baseUrl);
}

// ---------------------------------------------------------------------------
// Browser recycling — prevent CDP degradation on long crawls
// ---------------------------------------------------------------------------

export async function recycleBrowser(
	session: CrawlSession,
	opts: CrawlerOpts,
	attach: (page: Page) => void
): Promise<boolean> {
	if (session.reLoginFailed) return false;

	console.log('   ♻️  Recycling browser (CDP reset)...');
	flushRateLimits();
	try {
		if (session.browser) {
			try {
				const closePromise = session.browser.close();
				const timer = Bun.sleep(5000).then(() => {
					throw new Error('close timeout');
				});
				await Promise.race([closePromise, timer]);
			} catch {
				const pid = session.browser.process()?.pid;
				if (pid) {
					try {
						process.kill(pid);
					} catch {
						// Process may already be dead
					}
				}
				await Bun.sleep(2000);
			}
			session.browser = null;
			session.page = null;
		}

		await launchSession(session, attach);

		if (session.loginCredentials && session.page) {
			await session.page.goto(`${opts.baseUrl}/login`, {
				timeout: opts.timeout,
				waitUntil: 'networkidle2',
			});
			await session.page.waitForSelector('#username', { timeout: 15000 });
			await session.page.type('#username', session.loginCredentials.email, { delay: 10 });
			await session.page.type('#password', session.loginCredentials.password, { delay: 10 });
			await session.page.click('button[type="submit"]');
			await session.page.waitForFunction(() => location.pathname === '/dashboard', {
				timeout: 20000,
			});
			await waitForContent(session.page, opts.pageSettleDelay);

			// Verify dashboard actually rendered — if blank, the dev server may
			// be temporarily overwhelmed (e.g. after heavy database admin clicks).
			// Retry with increasing delays to let the server recover.
			for (let attempt = 0; attempt < 3; attempt++) {
				const contentLen = await session.page.evaluate(() => {
					const main = document.querySelector('main');
					return (main ?? document.body).innerText?.trim().length ?? 0;
				});
				if (contentLen > 50) break;
				const delay = 2000 * (attempt + 1);
				console.log(
					`   ⟳ Dashboard content sparse (${contentLen} chars), retrying in ${delay}ms...`
				);
				await Bun.sleep(delay);
				await session.page.reload({
					timeout: opts.timeout,
					waitUntil: 'networkidle2',
				});
				await waitForContent(session.page, opts.pageSettleDelay);
			}
		}

		session.reLoginFailed = false;
		console.log('   ♻️  Browser recycled successfully');
		return true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.log(`   ⚠️  Browser recycle failed: ${msg}`);
		session.reLoginFailed = true;
		return false;
	}
}
