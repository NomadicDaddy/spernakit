/**
 * Interactive element discovery and testing for crawltest.
 */
import type { Page } from 'puppeteer';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, InteractiveElement } from './crawltest-types';

import { testButton, testSelect, testSwitch } from './crawltest-elements';
import { SKIP_PATTERNS, isOnLoginPage, waitForContent } from './crawltest-types';

// ---------------------------------------------------------------------------
// Element discovery
// ---------------------------------------------------------------------------

export async function getInteractiveElements(page: Page): Promise<InteractiveElement[]> {
	return page.evaluate(() => {
		const elements: InteractiveElement[] = [];

		// Links — collected for reference, not clicked (they're visited as routes)
		document.querySelectorAll('a[href]').forEach((el, idx) => {
			const href = el.getAttribute('href');
			if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
				elements.push({
					href,
					index: idx,
					text: el.textContent?.trim().substring(0, 50) ?? '',
					type: 'link',
				});
			}
		});

		// Switches — tracked with their own index within role="switch" elements
		// Also capture id attribute for more reliable identification
		let switchIdx = 0;
		document.querySelectorAll('button[role="switch"]:not([disabled])').forEach((el) => {
			const text = el.textContent?.trim() ?? '';
			const ariaLabel = el.getAttribute('aria-label') ?? undefined;
			const elementId = el.getAttribute('id') ?? undefined;
			elements.push({
				ariaLabel,
				elementId,
				index: switchIdx++,
				text: text.substring(0, 50),
				type: 'switch',
			});
		});

		// Selects — tracked with their own index within role="combobox" elements
		let selectIdx = 0;
		document.querySelectorAll('button[role="combobox"]:not([disabled])').forEach((el) => {
			const text = el.textContent?.trim() ?? '';
			const ariaLabel = el.getAttribute('aria-label') ?? undefined;
			elements.push({
				ariaLabel,
				index: selectIdx++,
				text: text.substring(0, 50),
				type: 'select',
			});
		});

		// Buttons — everything else (non-switch, non-combobox)
		let buttonIdx = 0;
		document.querySelectorAll('button:not([disabled])').forEach((el) => {
			const text = el.textContent?.trim() ?? '';
			const role = el.getAttribute('role');
			const ariaChecked = el.getAttribute('aria-checked');

			// Skip switches and comboboxes (already collected above)
			if (role === 'switch' || role === 'combobox') return;
			// Skip toggle-like elements
			if (ariaChecked !== null) return;
			// Skip empty/undefined text
			if (text.length === 0 || text === 'undefined') return;

			const ariaLabel = el.getAttribute('aria-label') ?? undefined;
			elements.push({
				ariaLabel,
				index: buttonIdx++,
				text: text.substring(0, 50),
				type: 'button',
			});
		});

		return elements;
	});
}

// ---------------------------------------------------------------------------
// Element testing orchestrator
// ---------------------------------------------------------------------------

export async function testInteractiveElements(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	elements: InteractiveElement[],
	pageUrl: string
): Promise<void> {
	// Track tested element identifiers on this page to avoid duplicates
	const tested = new Set<string>();

	// Mutable queue — re-discovery after DOM changes can append new elements
	const queue: InteractiveElement[] = [...elements];

	// Track stale-element recovery attempts to prevent infinite loops
	const recovered = new Set<string>();

	for (let i = 0; i < queue.length; i++) {
		const element = queue[i];
		if (!element) continue;

		// Skip links — they are tested as separate route visits
		if (element.type === 'link') continue;

		// Dedup key: type + text (scoped to this page visit)
		const dedupKey = `${element.type}-${element.text}`;
		if (tested.has(dedupKey)) continue;
		tested.add(dedupKey);

		// Skip destructive/state-changing actions
		const label = element.text || element.ariaLabel || '';
		if (SKIP_PATTERNS.some((p) => p.test(label))) continue;

		// Verify button still exists in DOM (view/tab changes may unmount it)
		if (element.type === 'button' && !(await buttonExistsInDom(page, element.text))) {
			if (!recovered.has(dedupKey)) {
				// First encounter — reload page to reset view state, then re-discover
				recovered.add(dedupKey);
				tested.delete(dedupKey);
				console.log(`   🔄 Stale button "${label}" — reloading page`);
				await page.goto(pageUrl, {
					timeout: opts.timeout,
					waitUntil: 'domcontentloaded',
				});
				await waitForContent(page, opts.pageSettleDelay);

				// If stale-button reload redirected to /login (session expired),
				// abort element testing — visitRoute will handle re-login on next route.
				if (isOnLoginPage(page)) {
					console.log('   ⚠️  Session expired during element testing — aborting');
					return;
				}

				const fresh = await getInteractiveElements(page);
				queue.length = i + 1;
				for (const el of fresh) {
					const key = `${el.type}-${el.text}`;
					if (!tested.has(key)) queue.push(el);
				}
			}
			continue;
		}

		try {
			if (element.type === 'switch') {
				await testSwitch(page, results, opts, element, pageUrl);
			} else if (element.type === 'select') {
				await testSelect(page, results, element, pageUrl);
			} else {
				await testButton(page, results, opts, element, pageUrl);
			}
		} catch (err: unknown) {
			const typedErr = err instanceof Error ? err : new Error(String(err));
			// Element may have disappeared — non-fatal
			if (
				typedErr.message.includes('No element found') ||
				typedErr.message.includes('waiting for selector') ||
				typedErr.message.includes('not attached')
			) {
				console.log(`   ⚠️  Element gone: "${label}"`);
			} else {
				results.addClickedElement(
					`${element.type}[${element.index}]`,
					pageUrl,
					false,
					element.type,
					typedErr.message
				);
				console.log(`   ⚠️  Error testing ${element.type} "${label}": ${typedErr.message}`);
			}
		}

		await Bun.sleep(opts.interactionDelay);
	}
}

// ---------------------------------------------------------------------------
// Button existence check
// ---------------------------------------------------------------------------

async function buttonExistsInDom(page: Page, text: string): Promise<boolean> {
	return page.evaluate((t: string) => {
		const buttons = Array.from(document.querySelectorAll('button:not([disabled])')).filter(
			(b) => {
				const role = b.getAttribute('role');
				return role !== 'switch' && role !== 'combobox';
			}
		);
		return buttons.some((b) => b.textContent?.trim() === t);
	}, text);
}
