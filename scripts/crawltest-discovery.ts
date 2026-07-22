/**
 * Route discovery and content assertion for crawltest.
 */
import type { Page } from 'puppeteer';

import type { TestResults } from './crawltest-results';
import type { ContentAssertionEntry, CrawlerOpts } from './crawltest-types';

import { AUTH_PATH_PATTERNS, waitForContent } from './crawltest-types';

// ---------------------------------------------------------------------------
// Route discovery — multi-pass link scraping
// ---------------------------------------------------------------------------

export async function discoverRoutes(
	page: Page,
	opts: CrawlerOpts,
	seedRoutes: string[],
	maxDepth: number,
	onFlushRateLimits?: () => void
): Promise<string[]> {
	const discovered = new Set<string>();
	const toVisit: string[] = [];

	console.log('🔍 Discovering routes...');

	for (const route of seedRoutes) {
		const url = `${opts.baseUrl}${route}`;
		if (!discovered.has(url)) {
			discovered.add(url);
			toVisit.push(url);
		}
	}
	if (seedRoutes.length > 0) {
		console.log(`   Seed routes: added ${seedRoutes.length} configured routes`);
	}

	const initialLinks = await scrapeInternalLinks(page, opts.baseUrl);
	for (const href of initialLinks) {
		if (!discovered.has(href)) {
			discovered.add(href);
			toVisit.push(href);
		}
	}
	console.log(`   Pass 1 (dashboard): found ${discovered.size} routes`);

	let pass = 2;
	while (pass <= maxDepth && toVisit.length > 0) {
		const batch = [...toVisit];
		toVisit.length = 0;

		for (const [batchIdx, url] of batch.entries()) {
			// Flush rate limits periodically to prevent API call exhaustion
			if (batchIdx > 0 && batchIdx % 8 === 0) {
				onFlushRateLimits?.();
			}

			try {
				await page.goto(url, {
					timeout: opts.timeout,
					waitUntil: 'domcontentloaded',
				});
				await waitForContent(page, opts.pageSettleDelay);

				let links = await scrapeInternalLinks(page, opts.baseUrl);
				let newCount = addNewLinks(links, discovered, toVisit);

				// React.lazy TabLayout components may not have rendered yet.
				// If the page has links (sidebar rendered) but no NEW links,
				// wait for lazy chunks to load and re-scrape.
				if (links.length > 0 && newCount === 0) {
					await Bun.sleep(2000);
					links = await scrapeInternalLinks(page, opts.baseUrl);
					newCount = addNewLinks(links, discovered, toVisit);
				}
			} catch {
				// Discovery failure is non-fatal
			}
		}
		console.log(`   Pass ${pass}: total ${discovered.size} routes`);
		pass++;
	}

	return Array.from(discovered).sort();
}

function addNewLinks(links: string[], discovered: Set<string>, toVisit: string[]): number {
	let count = 0;
	for (const href of links) {
		if (!discovered.has(href)) {
			discovered.add(href);
			toVisit.push(href);
			count++;
		}
	}
	return count;
}

async function scrapeInternalLinks(page: Page, baseUrl: string): Promise<string[]> {
	const currentOrigin = new URL(baseUrl).origin;

	const hrefs = await page.evaluate((origin: string) => {
		const links: string[] = [];
		for (const el of document.querySelectorAll('a[href]')) {
			const href = el.getAttribute('href');
			if (!href) continue;
			if (href.startsWith('#') || href.startsWith('javascript:')) continue;

			let fullUrl: string;
			try {
				fullUrl = new URL(href, window.location.origin).toString();
			} catch {
				continue;
			}

			if (!fullUrl.startsWith(origin)) continue;
			links.push(fullUrl);
		}
		return links;
	}, currentOrigin);

	return hrefs.filter((url) => {
		const pathname = new URL(url).pathname;
		return !AUTH_PATH_PATTERNS.some((p) => p.test(pathname));
	});
}

// ---------------------------------------------------------------------------
// Content assertion
// ---------------------------------------------------------------------------

export async function assertPageContent(
	page: Page,
	results: TestResults,
	contentMinLength: number,
	url: string
): Promise<boolean> {
	try {
		await page.waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, {
			timeout: 8000,
		});
	} catch {
		// Timeout is acceptable
	}

	const result = await page.evaluate(() => {
		const main = document.querySelector('main');
		const text = main?.innerText ?? document.body.innerText ?? '';
		const hasHeading = !!document.querySelector('h1, h2');
		const isErrorPage = Array.from(document.querySelectorAll('h2')).some((h) =>
			/^something went wrong$/i.test(h.textContent?.trim() ?? '')
		);
		const is404Page = /\b404\b/.test(text) && /page not found/i.test(text);
		const trimmedLength = text.trim().length;
		return {
			hasContent: trimmedLength > 0,
			hasHeading,
			is404Page,
			isErrorPage,
			textLength: trimmedLength,
		};
	});

	const entry: ContentAssertionEntry = {
		hasContent: result.textLength >= contentMinLength,
		hasHeading: result.hasHeading,
		is404Page: result.is404Page,
		isErrorPage: result.isErrorPage,
		textLength: result.textLength,
		timestamp: new Date().toISOString(),
		url,
	};
	results.addContentAssertion(entry);

	if (result.isErrorPage) {
		results.addError('CONTENT_ERROR', `Error page detected at ${url}`);
		console.log(`   ❌ Error page detected`);
		return false;
	}
	if (result.is404Page) {
		results.addError('CONTENT_ERROR', `404 page detected at ${url}`);
		console.log(`   ❌ 404 page detected`);
		return false;
	}
	if (result.textLength < contentMinLength) {
		results.addError(
			'CONTENT_ERROR',
			`Insufficient content at ${url} (${result.textLength} chars, need ${contentMinLength})`
		);
		console.log(
			`   ❌ Insufficient content (${result.textLength} chars < ${contentMinLength})`
		);
		return false;
	}
	if (!result.hasHeading) {
		console.log(`   ⚠️  No heading found`);
	}

	console.log(`   ✓ Content OK (${result.textLength} chars)`);
	return true;
}

// ---------------------------------------------------------------------------
// Image dimension assertion
// ---------------------------------------------------------------------------

/**
 * Assert every rendered `<img>` declares explicit dimensions so the browser can
 * reserve layout space before the image loads, preventing Cumulative Layout Shift.
 *
 * A compliant `<img>` satisfies one of:
 * - declares non-empty `width` AND `height` HTML attributes, or
 * - has a non-`auto` computed CSS `aspect-ratio` (covers responsive images that
 *   use `width: 100%; aspect-ratio: x / y` instead of attributes).
 *
 * Per Web Interface Guidelines section 7.1. Any offender fails the crawl via
 * `results.addError('IMG_DIMENSION_ERROR', ...)`.
 */
export async function assertImageDimensions(
	page: Page,
	results: TestResults,
	url: string
): Promise<boolean> {
	const violations = await page.evaluate(() => {
		const offenders: { outerHtmlSnippet: string; src: string }[] = [];
		for (const img of document.querySelectorAll('img')) {
			const widthAttr = img.getAttribute('width');
			const heightAttr = img.getAttribute('height');
			const hasWidth = widthAttr !== null && widthAttr.trim() !== '';
			const hasHeight = heightAttr !== null && heightAttr.trim() !== '';
			if (hasWidth && hasHeight) continue;

			const computedAspect = getComputedStyle(img).aspectRatio;
			if (computedAspect && computedAspect !== 'auto') continue;

			offenders.push({
				outerHtmlSnippet: img.outerHTML.slice(0, 200),
				src: img.getAttribute('src') ?? '',
			});
		}
		return offenders;
	});

	if (violations.length === 0) return true;

	for (const v of violations) {
		results.addError(
			'IMG_DIMENSION_ERROR',
			`<img> element lacks explicit width/height (and no CSS aspect-ratio) at ${url}`,
			{ outerHtmlSnippet: v.outerHtmlSnippet, src: v.src, url }
		);
		console.log(`   ❌ img missing dimensions: ${v.src || '(no src)'}`);
	}
	return false;
}
