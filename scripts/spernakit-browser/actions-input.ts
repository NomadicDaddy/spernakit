import type { Page } from 'puppeteer';

/**
 * Form input actions — fill, type, select, check.
 * All ref-based actions use the snapshot engine to locate elements.
 */
import type { RefEntry } from './types.ts';

import { locateElement } from './snapshot.ts';

// ---------------------------------------------------------------------------
// Fill (clear + type)
// ---------------------------------------------------------------------------

export async function fillElement(
	page: Page,
	refs: RefEntry[],
	refStr: string,
	text: string
): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		// Clear and fill using browser-level input commands that React responds to.
		// React controlled components track values internally and ignore
		// programmatic value setting via native setters unless the internal
		// _valueTracker is reset. Using document.execCommand('insertText')
		// triggers real InputEvent events that React's event system handles.
		await handle.evaluate((el) => {
			const input = el as HTMLInputElement | HTMLTextAreaElement;
			input.focus();
			input.select();
			document.execCommand('deleteContent');
		});
		await handle.evaluate((el, value) => {
			const input = el as HTMLInputElement | HTMLTextAreaElement;
			input.focus();
			document.execCommand('insertText', false, value);
		}, text);
		return `Filled ${refStr} with "${text}"`;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Type (append without clearing)
// ---------------------------------------------------------------------------

export async function typeElement(
	page: Page,
	refs: RefEntry[],
	refStr: string,
	text: string
): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		// Append text using browser-level input command that React responds to.
		await handle.evaluate((el, value) => {
			const input = el as HTMLInputElement | HTMLTextAreaElement;
			input.focus();
			// Move cursor to end
			if (input.setSelectionRange) {
				input.setSelectionRange(input.value.length, input.value.length);
			}
			document.execCommand('insertText', false, value);
		}, text);
		return `Typed "${text}" into ${refStr}`;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Select (for native <select> or shadcn combobox)
// ---------------------------------------------------------------------------

export async function selectOption(
	page: Page,
	refs: RefEntry[],
	refStr: string,
	optionText: string
): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		const tagName = await handle.evaluate((el) => el.tagName.toLowerCase());

		if (tagName === 'select') {
			// Native <select> — use page.select() with the option value
			const optionValue = await handle.evaluate((el, text) => {
				const select = el as HTMLSelectElement;
				const option = Array.from(select.options).find(
					(o) => o.textContent?.trim() === text || o.value === text
				);
				return option?.value ?? null;
			}, optionText);

			if (optionValue === null) return `Error: option "${optionText}" not found in ${refStr}`;

			const refMatch = refStr.match(/\d+/);
			const refIndex = refMatch ? parseInt(refMatch[0], 10) - 1 : -1;
			const ref = refs[refIndex];
			if (!ref) return `Error: ref ${refStr} not found`;
			await page.select(ref.selector, optionValue);
			return `Selected "${optionText}" in ${refStr}`;
		}

		// shadcn combobox: click to open, then find and click the option
		await handle.click();
		await Bun.sleep(300);

		// Look for the option in the dropdown
		const clicked = await page.evaluate((text) => {
			const options = document.querySelectorAll(
				'[role="option"], [role="menuitem"], [data-state] [role="option"]'
			);
			for (const opt of options) {
				if (opt.textContent?.trim() === text) {
					(opt as HTMLElement).click();
					return true;
				}
			}
			return false;
		}, optionText);

		if (!clicked) {
			// Close the dropdown
			await page.keyboard.press('Escape');
			return `Error: option "${optionText}" not found in combobox ${refStr}`;
		}

		return `Selected "${optionText}" in ${refStr}`;
	} finally {
		await handle.dispose();
	}
}

// ---------------------------------------------------------------------------
// Check (toggle checkbox)
// ---------------------------------------------------------------------------

export async function checkElement(page: Page, refs: RefEntry[], refStr: string): Promise<string> {
	const handle = await locateElement(page, refs, refStr);
	if (!handle) return `Error: element ${refStr} not found`;

	try {
		await handle.click();
		return `Toggled ${refStr}`;
	} finally {
		await handle.dispose();
	}
}
