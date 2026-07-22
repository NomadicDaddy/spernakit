/**
 * Specialized page tests for crawltest: 404, bug report, test data management.
 */
import type { Page } from 'puppeteer';

import path from 'node:path';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, CrawlerState } from './crawltest-types';

import { ensureScreenshotDir } from './crawltest-screenshots';
import { waitForContent } from './crawltest-types';

export { testBugReport } from './crawltest-bugreport';

// ---------------------------------------------------------------------------
// Test data management
// ---------------------------------------------------------------------------

export async function ensureTestDashboard(page: Page, state: CrawlerState): Promise<void> {
	// Check if any dashboards exist
	const existingId = await page.evaluate(async () => {
		try {
			const res = await fetch('/api/v1/dashboards', {
				credentials: 'include',
				method: 'GET',
			});
			const data = (await res.json()) as { data?: { id: number }[] };
			if (data?.data && data.data.length > 0 && data.data[0]) {
				return data.data[0].id;
			}
		} catch {
			// Ignore
		}
		return null;
	});

	if (existingId) return;

	// Create a test dashboard (CSRF token captured from login response by crawler)
	const csrfToken = state.csrfToken;
	const createdId = await page.evaluate(async (token: null | string) => {
		try {
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (token) headers['X-CSRF-Token'] = token;
			const res = await fetch('/api/v1/dashboards', {
				body: JSON.stringify({ name: '__crawltest-dashboard' }),
				credentials: 'include',
				headers,
				method: 'POST',
			});
			const data = (await res.json()) as { data?: { id: number } };
			return data?.data?.id ?? null;
		} catch {
			return null;
		}
	}, csrfToken);

	if (createdId) {
		state.createdTestDashboardId = createdId;
		console.log(`   Created test dashboard (id: ${createdId})`);
	}
}

export async function cleanupTestData(page: Page, state: CrawlerState): Promise<void> {
	if (state.createdTestDashboardId === null) return;

	state.cleaningUp = true;
	console.log('\n🧹 Cleaning up test data...');
	const id = state.createdTestDashboardId;

	// CSRF token captured from login response by crawler
	const csrfToken = state.csrfToken;

	try {
		await page.evaluate(
			async (dashboardId: number, token: null | string) => {
				try {
					const headers: Record<string, string> = {};
					if (token) headers['X-CSRF-Token'] = token;
					await fetch(`/api/v1/dashboards/${String(dashboardId)}`, {
						credentials: 'include',
						headers,
						method: 'DELETE',
					});
				} catch {
					// Ignore cleanup failures
				}
			},
			id,
			csrfToken
		);
		console.log(`   Deleted test dashboard (id: ${id})`);
	} catch {
		console.log('   ⚠️  Cleanup skipped (page context unavailable)');
	}
	state.createdTestDashboardId = null;
	state.cleaningUp = false;
}

// ---------------------------------------------------------------------------
// 404 page test
// ---------------------------------------------------------------------------

export async function test404Page(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	state: CrawlerState,
	rootDir: string
): Promise<void> {
	const testUrl = `${opts.baseUrl}/__crawltest-nonexistent-route-404`;
	console.log(`\n🚫 Testing 404 page: ${testUrl}`);

	state.testing404 = true;
	try {
		await page.goto(testUrl, {
			timeout: opts.timeout,
			waitUntil: 'domcontentloaded',
		});
		await waitForContent(page, opts.pageSettleDelay);

		const finalUrl = page.url();
		results.visitedUrls.add(finalUrl);

		// Relaxed content assertion for 404 pages: check for error boundary only
		try {
			await page.waitForFunction(
				() => document.querySelectorAll('.animate-pulse').length === 0,
				{ timeout: 8000 }
			);
		} catch {
			// Timeout acceptable
		}

		const result = await page.evaluate(() => {
			const main = document.querySelector('main');
			const text = main?.innerText ?? document.body.innerText ?? '';
			const isErrorPage = Array.from(document.querySelectorAll('h2')).some((h) =>
				/^something went wrong$/i.test(h.textContent?.trim() ?? '')
			);
			return { isErrorPage, textLength: text.trim().length };
		});

		if (result.isErrorPage) {
			results.addError(
				'CONTENT_ERROR',
				'Error boundary detected on 404 page — should show a clean 404 instead'
			);
			console.log('   ❌ Error boundary detected on 404 page');
		} else {
			console.log(`   ✓ 404 page OK (${result.textLength} chars, no error boundary)`);
		}

		// Screenshot (if enabled)
		const dir404 = await ensureScreenshotDir(opts, state, rootDir);
		if (dir404) {
			const filepath = path.join(dir404, '404.png');
			try {
				await page.screenshot({ path: filepath });
				results.screenshotsTaken++;
				console.log(`   📸 Screenshot: ${filepath}`);
			} catch {
				console.log('   ⚠️  Screenshot failed for 404 page');
			}
		}
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		results.addError('VISIT_ERROR', `404 test failed: ${typedErr.message}`);
		console.log(`   ❌ 404 test error: ${typedErr.message}`);
	} finally {
		state.testing404 = false;
	}
}
