/**
 * Run one regression-suite step against a page.
 *
 * Selectors resolve through `data-testid` or the accessibility tree (puppeteer's `aria/` query),
 * never CSS, and each must match exactly one element, so a step can't silently act on the wrong
 * one. A wait that runs out fails the step with what was expected. `signIn` and `restartBackend`
 * need the runner's session and instance, so it supplies them as callbacks.
 */
import type { ElementHandle, Page } from 'puppeteer';

import { type Selector, type Step, withRunId } from './suite.ts';

const WAIT_MS = 15_000;

export interface StepContext {
	origin: string;
	page: Page;
	restartBackend: () => Promise<void>;
	runId: string;
	signIn: () => Promise<void>;
}

function query(selector: Selector): string {
	if ('testId' in selector) return `[data-testid="${selector.testId.replaceAll('"', '\\"')}"]`;
	return `aria/${selector.name}[role="${selector.role}"]`;
}

function describe(selector: Selector): string {
	return 'testId' in selector
		? `testId "${selector.testId}"`
		: `${selector.role} "${selector.name}"`;
}

/** The one element `selector` names, waiting for it to appear; fails on none or several. */
async function only(page: Page, selector: Selector): Promise<ElementHandle> {
	const css = query(selector);
	try {
		await page.waitForSelector(css, { timeout: WAIT_MS, visible: true });
	} catch {
		throw new Error(`${describe(selector)} never appeared.`);
	}
	const matches = await page.$$(css);
	if (matches.length !== 1) {
		throw new Error(
			`${describe(selector)} matched ${String(matches.length)} elements; it must match exactly one.`,
		);
	}
	const [match] = matches;
	if (match === undefined) throw new Error(`${describe(selector)} vanished.`);
	return match;
}

async function waitForPath(page: Page, path: string): Promise<void> {
	try {
		await page.waitForFunction(
			(expected: string) => location.pathname === expected,
			{ timeout: WAIT_MS },
			path,
		);
	} catch {
		throw new Error(
			`expected to be on ${path}, but the page is on ${new URL(page.url()).pathname}.`,
		);
	}
}

async function waitForText(page: Page, text: string): Promise<void> {
	try {
		await page.waitForFunction(
			(needle: string) => document.body.innerText.includes(needle),
			{ timeout: WAIT_MS },
			text,
		);
	} catch {
		throw new Error(`the text "${text}" never appeared.`);
	}
}

export async function runStep(step: Step, ctx: StepContext): Promise<void> {
	if ('goto' in step) {
		await ctx.page.goto(`${ctx.origin}${step.goto}`, {
			timeout: WAIT_MS * 2,
			waitUntil: 'networkidle2',
		});
	} else if ('signIn' in step) {
		await ctx.signIn();
	} else if ('click' in step) {
		await (await only(ctx.page, step.click)).click();
	} else if ('fill' in step) {
		const element = await only(ctx.page, step.fill);
		await element.click({ count: 3 });
		await element.type(withRunId(step.value, ctx.runId), { delay: 5 });
	} else if ('expectUrl' in step) {
		await waitForPath(ctx.page, step.expectUrl);
	} else if ('expectText' in step) {
		await waitForText(ctx.page, withRunId(step.expectText, ctx.runId));
	} else if ('expectSelector' in step) {
		await only(ctx.page, step.expectSelector);
	} else {
		await ctx.restartBackend();
	}
}

/**
 * Fail the case if the page ever navigates off its own origin. Returns a function that throws the
 * first such navigation, checked after every step.
 */
export function guardOrigin(page: Page, origin: string): () => void {
	let left: null | string = null;
	page.on('framenavigated', (frame) => {
		if (frame !== page.mainFrame() || left !== null) return;
		const url = frame.url();
		if (url !== 'about:blank' && new URL(url).origin !== origin) left = url;
	});
	return () => {
		if (left !== null) throw new Error(`the page left its origin for ${left}.`);
	};
}
