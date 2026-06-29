import type { ElementHandle, Page } from 'puppeteer';

/**
 * Element interaction actions — click, fill, type, select, press, scroll.
 * All ref-based actions use the snapshot engine to locate elements.
 */
import { existsSync, statSync } from 'node:fs';

import type { RefEntry } from './types';

import { locateElement } from './snapshot';

// Form input actions live in actions-input.ts; re-exported to keep the
// actions.ts import surface unchanged.
export { checkElement, fillElement, selectOption, typeElement } from './actions-input.ts';

// ---------------------------------------------------------------------------
// Click
// ---------------------------------------------------------------------------

export async function clickElement(page: Page, refs: RefEntry[], refStr: string): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		// Single synthetic event sequence covers all React + Radix UI patterns:
		// pointerdown → mousedown → pointerup → mouseup → click → focus, all
		// dispatched directly on the element handle.
		//
		// Why synthetic-only (no CDP page.mouse.click first):
		//
		//   Previously this function fired page.mouse.click() AND the synthetic
		//   sequence in that order. Two click operations on the same toggle
		//   component (Radix DropdownMenu, Popover, Dialog trigger, UserMenu)
		//   produce an open-then-close cycle — the first click opens the menu,
		//   the second click is interpreted as the trigger being clicked again
		//   and closes it. The net observable effect is "click registered, menu
		//   did not open." This was the root cause of the
		//   `remediation-20260415-bug-report-dialog-drops-resubmit` and
		//   `remediation-20260415-coordinator-filter-dropdown-broken` false
		//   positives filed during the 2026-04-15 spernakit-tester runs,
		//   which were both retired after real-browser manual verification
		//   confirmed the components worked correctly — the bug was here.
		//
		//   Synthetic events alone cover:
		//     - onClick listeners (standard React button handlers)
		//     - onMouseDown / onPointerDown (Radix Tabs, DropdownMenu, Popover,
		//       Dialog, Sheet triggers via useControllableState)
		//     - Focus management for inputs and triggers
		//
		//   The only case synthetic events do not cover is React Router <Link>
		//   client-side navigation, which requires the native DOM .click()
		//   because React Router patches link.onclick directly. We handle
		//   that case with an explicit .click() on <a> elements below.
		//
		// If a future host requires CDP-trusted events (e.g. anti-bot
		// detection on a scraped site), re-introduce page.mouse.click as an
		// OPT-IN parameter, never unconditional dual-fire.
		await handle.scrollIntoView();

		const tagName = await handle.evaluate((el) => {
			const target = el as HTMLElement;
			const rect = target.getBoundingClientRect();
			const eventInit: MouseEventInit = {
				bubbles: true,
				button: 0,
				cancelable: true,
				clientX: rect.x + rect.width / 2,
				clientY: rect.y + rect.height / 2,
			};
			target.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1 }));
			target.dispatchEvent(new MouseEvent('mousedown', eventInit));
			target.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerId: 1 }));
			target.dispatchEvent(new MouseEvent('mouseup', eventInit));
			target.dispatchEvent(new MouseEvent('click', eventInit));
			target.focus();
			return target.tagName.toLowerCase();
		});

		// DOM .click() only for links — React Router <Link> needs a native click
		// for client-side navigation. Skip for non-links to avoid double-toggling
		// Radix Dialog/Popover/Sheet triggers that open on the synthetic click above.
		if (tagName === 'a') {
			await handle.evaluate((el) => (el as HTMLElement).click());
		}

		return `Clicked ${refStr}`;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Press key
// ---------------------------------------------------------------------------

export async function pressKey(page: Page, key: string): Promise<string> {
	// Support modifier combos like "Control+Enter"
	await page.keyboard.press(key as Parameters<typeof page.keyboard.press>[0]);
	return `Pressed ${key}`;
}

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

export async function scroll(
	page: Page,
	direction: 'down' | 'up',
	pixels: number,
	selector?: string
): Promise<string> {
	const delta = direction === 'down' ? pixels : -pixels;

	if (selector) {
		await page.evaluate(
			(sel, d) => {
				const el = document.querySelector(sel);
				if (el) el.scrollBy(0, d);
			},
			selector,
			delta
		);
		return `Scrolled ${direction} ${pixels}px in ${selector}`;
	}

	await page.evaluate((d) => window.scrollBy(0, d), delta);
	return `Scrolled ${direction} ${pixels}px`;
}

// ---------------------------------------------------------------------------
// File upload
// ---------------------------------------------------------------------------

/**
 * Attach one or more files to a file <input>. The target may be a snapshot
 * ref (@eN) or a raw CSS selector — most apps hide the underlying file input
 * (opacity:0, visually-hidden wrapper, etc.), which makes it invisible to the
 * snapshot engine. In those cases pass a selector like `input[type=file]`
 * directly.
 *
 * Puppeteer's ElementHandle.uploadFile sets the input's FileList and fires the
 * `change` event React listens for, so framework-controlled file pickers and
 * dropzone components (react-dropzone, shadcn/ui upload, etc.) all see the
 * upload without any further interaction.
 */
export async function uploadFile(
	page: Page,
	refs: RefEntry[],
	target: string,
	filePaths: string[]
): Promise<string> {
	for (const p of filePaths) {
		if (!existsSync(p)) return `Error: file not found: ${p}`;
		if (!statSync(p).isFile()) return `Error: not a file: ${p}`;
	}

	const handle = target.startsWith('@e')
		? await locateElement(page, refs, target)
		: await page.$(target);
	if (!handle) return `Error: element ${target} not found`;

	try {
		const tagName = await handle.evaluate((el) => el.tagName.toLowerCase());
		const inputType = await handle.evaluate((el) =>
			(el.getAttribute('type') ?? '').toLowerCase()
		);
		if (tagName !== 'input' || inputType !== 'file') {
			return `Error: ${target} is not a file input (got <${tagName} type="${inputType}">)`;
		}

		await (handle as ElementHandle<HTMLInputElement>).uploadFile(...filePaths);
		const label = filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files`;
		return `Uploaded ${label} to ${target}`;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Get text
// ---------------------------------------------------------------------------

export async function getText(page: Page, refs: RefEntry[], refStr: string): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		const text = await handle.evaluate((el) => el.textContent?.trim() ?? '');
		return text;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Get URL
// ---------------------------------------------------------------------------

export function getUrl(page: Page): string {
	return page.url();
}
