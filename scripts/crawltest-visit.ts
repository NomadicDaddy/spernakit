import type { TestResults } from './crawltest-results';
/**
 * Per-route visit logic for crawltest: navigate, assert content, screenshot,
 * and test interactive elements — with degraded-page and session recovery.
 */
import type { CrawlSession } from './crawltest-session';
import type { CrawlerOpts, CrawlerState } from './crawltest-types';

import { assertImageDimensions, assertPageContent } from './crawltest-discovery';
import { getInteractiveElements, testInteractiveElements } from './crawltest-interactions';
import { screenshotPage, screenshotSubTabs } from './crawltest-screenshots';
import { isOnLoginPage, waitForContent } from './crawltest-types';

// ---------------------------------------------------------------------------
// Per-route visit: navigate → assert → test elements
// ---------------------------------------------------------------------------

export async function visitRoute(
	session: CrawlSession,
	results: TestResults,
	opts: CrawlerOpts,
	state: CrawlerState,
	rootDir: string,
	url: string,
	recycle: () => Promise<boolean>
): Promise<void> {
	if (!session.page) return;

	console.log(`\n📄 Testing: ${url}`);

	try {
		await navigateWithRetry(session, opts, url);
		state.navigationCount++;
		await waitForContent(session.page, opts.pageSettleDelay);

		// Recovery: detect CDP-degraded page (only layout chrome rendered)
		if (await isPageDegraded(session)) {
			console.log('   ⟳ Page appears degraded — reloading...');
			try {
				await session.page.reload({
					timeout: opts.timeout,
					waitUntil: 'domcontentloaded',
				});
				await waitForContent(session.page, opts.pageSettleDelay);
			} catch {
				// Reload failed
			}
			if (await isPageDegraded(session)) {
				console.log('   ⟳ Still degraded — recycling browser...');
				const ok = await recycle();
				state.navigationCount = 0;
				if (ok && session.page) {
					await navigateWithRetry(session, opts, url);
					state.navigationCount++;
					await waitForContent(session.page, opts.pageSettleDelay);

					// If still degraded after recycle, wait longer for dev server
					// to recover from proxy pressure before giving up
					if (await isPageDegraded(session)) {
						console.log('   ⟳ Still degraded after recycle — extended wait...');
						await Bun.sleep(3000);
						await session.page.reload({
							timeout: opts.timeout,
							waitUntil: 'networkidle2',
						});
						await waitForContent(session.page, opts.pageSettleDelay);
					}
				}
			}
		}

		if (isOnLoginPage(session.page) && session.loginCredentials) {
			const ok = await recycle();
			state.navigationCount = 0;
			if (ok && session.page) {
				await navigateWithRetry(session, opts, url);
				state.navigationCount++;
				await waitForContent(session.page, opts.pageSettleDelay);
			}
		}

		if (!session.page) return;

		const finalUrl = session.page.url();
		results.visitedUrls.add(finalUrl);
		if (finalUrl !== url) {
			results.visitedUrls.add(url);
			console.log(`   Redirected to: ${finalUrl}`);
		}

		// Content assertion
		await assertPageContent(session.page, results, opts.contentMinLength, finalUrl);

		// CLS guard: every <img> must declare explicit dimensions (or CSS aspect-ratio)
		await assertImageDimensions(session.page, results, finalUrl);

		// Screenshot (if enabled) — use original URL for filename so redirected
		// pages (e.g. /explorer → /explorer/databases) still produce explorer.png
		const ssPath = await screenshotPage(session.page, results, opts, state, rootDir, url);
		if (ssPath) console.log(`   📸 Screenshot: ${ssPath}`);

		// Screenshot sub-tabs (in-page view switchers)
		const subTabNavs = await screenshotSubTabs(session.page, results, opts, rootDir, finalUrl);
		state.navigationCount += subTabNavs;

		// Discover and test interactive elements on this page
		const elements = await getInteractiveElements(session.page);
		const testableCount = elements.filter((e) => e.type !== 'link').length;
		console.log(
			`   Found ${elements.length} elements (${testableCount} testable, ${elements.length - testableCount} links)`
		);

		await testInteractiveElements(session.page, results, opts, elements, finalUrl);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		results.addError('VISIT_ERROR', typedErr.message, { url });
		console.log(`   ❌ Error visiting: ${typedErr.message}`);
	}
}

// ---------------------------------------------------------------------------
// Degraded-page detection and navigation retry
// ---------------------------------------------------------------------------

async function isPageDegraded(session: CrawlSession): Promise<boolean> {
	if (!session.page) return true;
	try {
		return await session.page.evaluate(() => {
			const main = document.querySelector('main');
			const textLen = (main ?? document.body).innerText?.trim().length ?? 0;
			if (textLen > 100) return false;
			// Layout chrome is ~89 chars — check if sidebar rendered
			const sidebarLinks = document.querySelectorAll('aside a');
			return sidebarLinks.length === 0;
		});
	} catch {
		return true;
	}
}

async function navigateWithRetry(
	session: CrawlSession,
	opts: CrawlerOpts,
	url: string
): Promise<void> {
	if (!session.page) return;
	try {
		await session.page.goto(url, {
			timeout: opts.timeout,
			waitUntil: 'domcontentloaded',
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('net::ERR_ABORTED')) {
			console.log('   ⟳ Retrying after ERR_ABORTED...');
			await Bun.sleep(500);
			await session.page.goto(url, {
				timeout: opts.timeout,
				waitUntil: 'domcontentloaded',
			});
		} else {
			throw err;
		}
	}
}
