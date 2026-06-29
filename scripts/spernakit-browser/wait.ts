/**
 * Wait utilities — network idle, element visible, URL pattern, text, JS condition.
 */
import type { Page } from 'puppeteer';

import type { RefEntry } from './types';

import { resolveRef } from './snapshot';

/** Wait for network to become idle (no pending requests for 500ms). */
export async function waitForNetworkIdle(page: Page, timeout = 30_000): Promise<string> {
	try {
		await page.waitForNetworkIdle({ idleTime: 500, timeout });
		return 'Network idle';
	} catch {
		return 'Warning: network idle timeout reached';
	}
}

/** Wait for an element (CSS selector or @ref) to appear in the DOM. */
export async function waitForElement(
	page: Page,
	refs: RefEntry[],
	target: string,
	options?: { state?: 'hidden' | 'visible'; timeout?: number }
): Promise<string> {
	const timeout = options?.timeout ?? 30_000;
	const state = options?.state ?? 'visible';

	let selector: string;
	if (target.startsWith('@e')) {
		const ref = resolveRef(refs, target);
		if (!ref) return `Error: ref ${target} not found`;
		selector = ref.selector;
	} else {
		selector = target;
	}

	try {
		if (state === 'hidden') {
			await page.waitForSelector(selector, { hidden: true, timeout });
			return `Element ${target} is hidden`;
		}
		await page.waitForSelector(selector, { timeout, visible: true });
		return `Element ${target} is visible`;
	} catch {
		return `Warning: timeout waiting for ${target} to be ${state}`;
	}
}

/** Wait for the current URL to match a glob pattern. */
export async function waitForUrl(page: Page, pattern: string, timeout = 30_000): Promise<string> {
	const regex = globToRegex(pattern);
	try {
		await page.waitForFunction(
			(re: string) => new RegExp(re).test(window.location.href),
			{ timeout },
			regex.source
		);
		return `URL matches ${pattern}`;
	} catch {
		return `Warning: URL did not match ${pattern} within timeout`;
	}
}

/** Wait for text to appear on the page. */
export async function waitForText(page: Page, text: string, timeout = 30_000): Promise<string> {
	try {
		await page.waitForFunction(
			(t: string) => document.body.innerText.includes(t),
			{ timeout },
			text
		);
		return `Text "${text}" found`;
	} catch {
		return `Warning: text "${text}" not found within timeout`;
	}
}

/** Wait for a JavaScript condition to become truthy. */
export async function waitForFunction(
	page: Page,
	expression: string,
	timeout = 30_000
): Promise<string> {
	try {
		await page.waitForFunction(expression, { timeout });
		return 'Condition met';
	} catch {
		return 'Warning: condition not met within timeout';
	}
}

/** Wait a fixed number of milliseconds. */
export async function waitMs(ms: number): Promise<string> {
	await Bun.sleep(ms);
	return `Waited ${ms}ms`;
}

/** Wait for page load event. */
export async function waitForLoad(
	page: Page,
	event: 'domcontentloaded' | 'load' | 'networkidle',
	timeout = 30_000
): Promise<string> {
	try {
		if (event === 'networkidle') {
			return waitForNetworkIdle(page, timeout);
		}
		await page.waitForNavigation({ timeout, waitUntil: event });
		return `Page ${event} complete`;
	} catch {
		return `Warning: ${event} timeout reached`;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a simple glob pattern (with ** and *) to a regex. */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '.*')
		.replace(/\*/g, '[^/]*');
	return new RegExp(escaped);
}
