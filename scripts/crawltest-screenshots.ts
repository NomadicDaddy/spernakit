/**
 * Screenshot capture and sub-tab detection for crawltest.
 */
import type { Page } from 'puppeteer';

import path from 'node:path';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, CrawlerState } from './crawltest-types';

import { SKIP_PATTERNS } from './crawltest-types';

// ---------------------------------------------------------------------------
// Screenshot directory management
// ---------------------------------------------------------------------------

export async function ensureScreenshotDir(
	opts: CrawlerOpts,
	state: CrawlerState,
	rootDir: string
): Promise<null | string> {
	if (!opts.screenshotDir) return null;
	const dir = path.resolve(rootDir, opts.screenshotDir);
	if (!state.screenshotDirCreated) {
		const fs = await import('node:fs');
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		state.screenshotDirCreated = true;
	}
	return dir;
}

// ---------------------------------------------------------------------------
// Page screenshot
// ---------------------------------------------------------------------------

export async function screenshotPage(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	state: CrawlerState,
	rootDir: string,
	url: string
): Promise<null | string> {
	const dir = await ensureScreenshotDir(opts, state, rootDir);
	if (!dir) return null;

	const urlPath = new URL(url).pathname.replace(/^\//, '').replace(/\//g, '-') || 'root';
	const filename = `${urlPath}.png`;
	const filepath = path.join(dir, filename);

	const SCREENSHOT_TIMEOUT = 15_000;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const screenshotPromise = page.screenshot({
				captureBeyondViewport: false,
				optimizeForSpeed: true,
				path: filepath,
			});
			const timeoutPromise = Bun.sleep(SCREENSHOT_TIMEOUT).then(() => {
				throw new Error('Screenshot timed out');
			});
			await Promise.race([screenshotPromise, timeoutPromise]);
			results.screenshotsTaken++;
			state.consecutiveScreenshotFailures = 0;
			return filepath;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (attempt === 0 && msg.includes('timed out')) {
				console.log(`   ⚠️  Screenshot timeout, retrying after reload...`);
				try {
					await page.reload({
						timeout: opts.timeout,
						waitUntil: 'networkidle2',
					});
					await Bun.sleep(2000);
				} catch {
					// Reload failed — give up
				}
				continue;
			}
			console.log(`   ⚠️  Screenshot failed for ${url}: ${msg}`);
			state.consecutiveScreenshotFailures++;
			return null;
		}
	}
	state.consecutiveScreenshotFailures++;
	return null;
}

// ---------------------------------------------------------------------------
// Sub-tab detection
// ---------------------------------------------------------------------------

async function detectSubTabs(
	page: Page
): Promise<{ tabs: { index: number; isActive: boolean; text: string }[] }[]> {
	return page.evaluate(() => {
		const groups: {
			tabs: { index: number; isActive: boolean; text: string }[];
		}[] = [];
		const seen = new WeakSet<Element>();

		// Pattern 2: <div class="border-b"> > <nav> > button tabs (NOT NavLinks)
		// NavLink tabs (rendered as <a> tags) navigate to distinct routes that the
		// crawler visits individually — sub-tab screenshots would be redundant
		// cross-products, so we only detect button-based in-page view switchers.
		for (const nav of document.querySelectorAll('div.border-b > nav')) {
			const tabEls = [...nav.querySelectorAll('button[type="button"]')];
			if (tabEls.length < 2 || tabEls.length > 12) continue;
			const tabs: { index: number; isActive: boolean; text: string }[] = [];
			for (const [i, el] of tabEls.entries()) {
				seen.add(el);
				tabs.push({
					index: i,
					isActive: el.className.includes('border-primary'),
					text: el.textContent?.trim() || '',
				});
			}
			if (tabs.filter((t) => t.isActive).length === 1) {
				groups.push({ tabs });
			}
		}

		// Pattern 1 & 3: Buttons/Badges in flex containers with variant toggle.
		for (const container of document.querySelectorAll(
			'div.flex.gap-2, div.flex.flex-wrap.gap-2'
		)) {
			const children = [...container.children].filter((el) => {
				if (seen.has(el)) return false;
				const tag = el.tagName.toLowerCase();
				const role = el.getAttribute('role');
				return (
					tag === 'button' ||
					role === 'button' ||
					(tag === 'div' && el.className.includes('cursor-pointer'))
				);
			});
			if (children.length < 2 || children.length > 12) continue;

			const tabs: { index: number; isActive: boolean; text: string }[] = [];
			for (const [i, el] of children.entries()) {
				seen.add(el);
				const isActive = el.className.includes('bg-primary');
				const text = el.textContent?.trim() || '';
				if (!text) continue;
				tabs.push({ index: i, isActive, text });
			}

			if (tabs.length >= 2 && tabs.filter((t) => t.isActive).length === 1) {
				groups.push({ tabs });
			}
		}

		return groups;
	});
}

// ---------------------------------------------------------------------------
// Sub-tab screenshots
// ---------------------------------------------------------------------------

export async function screenshotSubTabs(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	rootDir: string,
	pageUrl: string
): Promise<number> {
	if (!opts.screenshotDir) return 0;

	const allGroups = await detectSubTabs(page);

	// Filter out groups that contain action buttons (not real tabs).
	const groups = allGroups.filter(
		(group) => !group.tabs.some((tab) => SKIP_PATTERNS.some((p) => p.test(tab.text)))
	);
	if (groups.length === 0) return 0;

	const urlSlug = new URL(pageUrl).pathname.replace(/^\//, '').replace(/\//g, '-') || 'root';
	const dir = path.resolve(rootDir, opts.screenshotDir);
	let subTabNavCount = 0;

	for (const [groupIdx, group] of groups.entries()) {
		const activeTab = group.tabs.find((t) => t.isActive);
		const inactiveTabs = group.tabs.filter((t) => !t.isActive);

		if (inactiveTabs.length === 0) continue;

		console.log(
			`   📑 Sub-tabs${groups.length > 1 ? ` [group ${groupIdx + 1}]` : ''}: ${group.tabs.map((t) => (t.isActive ? `[${t.text}]` : t.text)).join(' · ')}`
		);

		for (const tab of inactiveTabs) {
			try {
				// Click the tab via evaluate to avoid CDP multi-step issues
				const clicked = await page.evaluate((tabText) => {
					const candidates = [
						...document.querySelectorAll('button, div.cursor-pointer, [role="button"]'),
					].filter((el) => el.textContent?.trim() === tabText);
					if (candidates.length > 0) {
						(candidates[0] as HTMLElement).click();
						return true;
					}
					return false;
				}, tab.text);

				if (!clicked) continue;
				subTabNavCount++;

				// Wait for in-page tab content to render
				await Bun.sleep(opts.pageSettleDelay);

				// Take screenshot with tab name appended
				const tabSlug = tab.text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
				const filename = `${urlSlug}-${tabSlug}.png`;
				const filepath = path.join(dir, filename);

				try {
					await page.screenshot({
						captureBeyondViewport: false,
						optimizeForSpeed: true,
						path: filepath,
					});
					results.screenshotsTaken++;
					console.log(`   📸 Sub-tab: ${filepath}`);
				} catch {
					console.log(`   ⚠️  Sub-tab screenshot failed for ${tab.text}`);
				}
			} catch {
				// Non-fatal — skip this tab
			}
		}

		// Restore the original active tab
		if (activeTab) {
			try {
				await page.evaluate((tabText) => {
					const candidates = [
						...document.querySelectorAll('button, div.cursor-pointer, [role="button"]'),
					].filter((el) => el.textContent?.trim() === tabText);
					if (candidates.length > 0) {
						(candidates[0] as HTMLElement).click();
					}
				}, activeTab.text);
				subTabNavCount++;
				await Bun.sleep(300);
			} catch {
				// Non-fatal — page will be navigated away next anyway
			}
		}
	}

	return subTabNavCount;
}
