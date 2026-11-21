/**
 * Run one regression-suite step against a page.
 *
 * Selectors resolve through `data-testid` or the accessibility tree (puppeteer's `aria/` query),
 * never CSS, and each must match exactly one element, so a step can't silently act on the wrong
 * one. A wait that runs out fails the step with what was expected. `signIn` and `restartBackend`
 * need the runner's session and instance, so it supplies them as callbacks.
 *
 * `click` and `fill` act inside the page rather than through CDP input. Real CDP input stops
 * reaching the page shortly after an authenticated Spernakit route mounts (seen on two Chrome
 * builds and two puppeteer versions; the suite's first run hit it on /workspaces, where the
 * Create Workspace click opened nothing). So a click is the pointer sequence a user's press makes
 * and then the element's click, and a fill writes the value through the native setter and fires
 * `input`, the way crawltest does, so React sees the change.
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
		throw new Error(`${describe(selector)} never appeared on ${new URL(page.url()).pathname}.`);
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
		throw new Error(`the text "${text}" never appeared on ${new URL(page.url()).pathname}.`);
	}
}

/** A user's press: pointer and mouse down and up, then click, all dispatched in the page. */
async function press(element: ElementHandle): Promise<void> {
	await element.evaluate((el) => {
		if (!(el instanceof HTMLElement)) throw new Error('the target is not an HTML element.');
		el.scrollIntoView({ block: 'center' });
		const pointer = {
			bubbles: true,
			button: 0,
			cancelable: true,
			isPrimary: true,
			pointerId: 1,
		};
		el.dispatchEvent(new PointerEvent('pointerdown', pointer));
		el.dispatchEvent(new MouseEvent('mousedown', pointer));
		el.focus();
		el.dispatchEvent(new PointerEvent('pointerup', pointer));
		el.dispatchEvent(new MouseEvent('mouseup', pointer));
		el.click();
	});
}

/** Replace a text field's value the way React notices: the native setter, then `input`. */
async function fill(element: ElementHandle, value: string): Promise<void> {
	const filled = await element.evaluate((el, text) => {
		const proto =
			el instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: el instanceof HTMLInputElement
					? HTMLInputElement.prototype
					: null;
		if (proto === null || !(el instanceof HTMLElement)) return false;
		el.focus();
		// React installs its own value setter on the element, so write past it to the prototype's.
		// eslint-disable-next-line @typescript-eslint/unbound-method
		const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
		if (setter === undefined) return false;
		setter.call(el, text);
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	}, value);
	if (!filled) throw new Error('the fill target is not a text input or textarea.');
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
		await press(await only(ctx.page, step.click));
	} else if ('fill' in step) {
		await fill(await only(ctx.page, step.fill), withRunId(step.value, ctx.runId));
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
