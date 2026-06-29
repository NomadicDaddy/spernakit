/**
 * Per-element testers for crawltest: buttons, switches, and selects.
 */
import type { Page } from 'puppeteer';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, InteractiveElement } from './crawltest-types';

import { waitForContent } from './crawltest-types';

// ---------------------------------------------------------------------------
// Button testing — click, detect dialog, close
// ---------------------------------------------------------------------------

export async function testButton(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	element: InteractiveElement,
	pageUrl: string
): Promise<void> {
	const label = element.text || element.ariaLabel || `button[${element.index}]`;

	// Count dialogs/overlays before click
	const dialogsBefore = await page.evaluate(
		() =>
			document.querySelectorAll(
				'[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'
			).length
	);

	// Click via text match for reliability (filter out switches and comboboxes to match index)
	const clicked = await page.evaluate(
		(text: string, idx: number) => {
			const buttons = Array.from(document.querySelectorAll('button:not([disabled])')).filter(
				(b) => {
					const role = b.getAttribute('role');
					return role !== 'switch' && role !== 'combobox';
				}
			);
			// Try exact text match first
			let btn = buttons.find((b) => b.textContent?.trim() === text);
			// Fall back to index if text match fails
			if (!btn && buttons[idx]) {
				btn = buttons[idx];
			}
			if (btn) {
				(btn as HTMLElement).click();
				return true;
			}
			return false;
		},
		element.text,
		element.index
	);

	if (!clicked) {
		console.log(`   ⚠️  Could not find button: "${label}"`);
		return;
	}

	await Bun.sleep(500);

	// Check if a dialog/overlay appeared
	const dialogsAfter = await page.evaluate(
		() =>
			document.querySelectorAll(
				'[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'
			).length
	);

	if (dialogsAfter > dialogsBefore) {
		console.log(`   🖱️  Button "${label}" → dialog opened`);
		results.addClickedElement(`button "${label}"`, pageUrl, true, 'dialog-trigger');
		results.dialogsTested++;

		// Close dialog via Escape
		await page.keyboard.press('Escape');
		await Bun.sleep(300);
	} else {
		console.log(`   🖱️  Button "${label}" → clicked`);
		results.addClickedElement(`button "${label}"`, pageUrl, true, 'click');
	}

	// If navigation occurred, go back to the page we were testing
	if (page.url() !== pageUrl) {
		await page.goto(pageUrl, {
			timeout: opts.timeout,
			waitUntil: 'domcontentloaded',
		});
		await waitForContent(page, opts.pageSettleDelay);
	}
}

// ---------------------------------------------------------------------------
// Switch testing — toggle then restore
// ---------------------------------------------------------------------------

export async function testSwitch(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	element: InteractiveElement,
	pageUrl: string
): Promise<void> {
	const label =
		element.elementId || element.text || element.ariaLabel || `switch[${element.index}]`;

	// Get current state
	const stateBefore = await page.evaluate(
		(elementId: string | undefined, idx: number) => {
			const switches = Array.from(
				document.querySelectorAll('button[role="switch"]:not([disabled])')
			);
			let sw = elementId ? switches.find((s) => s.getAttribute('id') === elementId) : null;
			if (!sw && switches[idx]) sw = switches[idx];
			if (sw) return sw.getAttribute('aria-checked');
			return null;
		},
		element.elementId,
		element.index
	);

	if (stateBefore === null) {
		console.log(`   ⚠️  Switch not found: "${label}"`);
		return;
	}

	// Toggle
	await page.evaluate(
		(elementId: string | undefined, idx: number) => {
			const switches = Array.from(
				document.querySelectorAll('button[role="switch"]:not([disabled])')
			);
			let sw = elementId ? switches.find((s) => s.getAttribute('id') === elementId) : null;
			if (!sw && switches[idx]) sw = switches[idx];
			if (sw) (sw as HTMLElement).click();
		},
		element.elementId,
		element.index
	);

	// Wait for the full save cycle: mutation completes, query refetches, state updates.
	try {
		await page.waitForFunction(
			(elementId: string | undefined, idx: number, originalState: string) => {
				const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
				let sw = elementId
					? switches.find((s) => s.getAttribute('id') === elementId)
					: null;
				if (!sw && switches[idx]) sw = switches[idx];
				if (!sw) return true; // Element gone, move on
				return (
					!sw.hasAttribute('disabled') &&
					sw.getAttribute('aria-checked') !== originalState
				);
			},
			{ timeout: 5000 },
			element.elementId,
			element.index,
			stateBefore
		);
	} catch {
		// Timeout — state didn't change (save may have failed or switch not toggleable)
	}

	// Read final state
	const stateAfter = await page.evaluate(
		(elementId: string | undefined, idx: number) => {
			const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
			let sw = elementId ? switches.find((s) => s.getAttribute('id') === elementId) : null;
			if (!sw && switches[idx]) sw = switches[idx];
			if (sw) return sw.getAttribute('aria-checked');
			return null;
		},
		element.elementId,
		element.index
	);

	const toggled = stateAfter !== null && stateAfter !== stateBefore;

	if (toggled) {
		// Restore original state (include disabled switches since save operations may disable them)
		await page.evaluate(
			(elementId: string | undefined, idx: number) => {
				const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
				// First try to match by id (most reliable)
				let sw = elementId
					? switches.find((s) => s.getAttribute('id') === elementId)
					: null;
				// Fall back to index
				if (!sw && switches[idx]) sw = switches[idx];
				if (sw) (sw as HTMLElement).click();
			},
			element.elementId,
			element.index
		);
		await Bun.sleep(200);
	}

	console.log(
		`   🔀 Switch "${label}": ${stateBefore} → ${stateAfter}${toggled ? ' (restored)' : ''}`
	);
	results.addClickedElement(
		`switch "${label}"`,
		pageUrl,
		toggled,
		'switch-toggle',
		toggled ? null : 'state did not change'
	);
	results.switchesTested++;
}

// ---------------------------------------------------------------------------
// Select testing — open dropdown then close via Escape
// ---------------------------------------------------------------------------

export async function testSelect(
	page: Page,
	results: TestResults,
	element: InteractiveElement,
	pageUrl: string
): Promise<void> {
	const label = element.text || element.ariaLabel || `select[${element.index}]`;

	// Click to open
	await page.evaluate(
		(text: string, idx: number) => {
			const combos = Array.from(
				document.querySelectorAll('button[role="combobox"]:not([disabled])')
			);
			let cb = combos.find((c) => c.textContent?.trim() === text);
			if (!cb && combos[idx]) cb = combos[idx];
			if (cb) (cb as HTMLElement).click();
		},
		element.text,
		element.index
	);

	await Bun.sleep(300);

	// Check if listbox appeared
	const hasListbox = await page.evaluate(
		() => document.querySelectorAll('[role="listbox"], [role="option"]').length > 0
	);

	if (hasListbox) {
		console.log(`   📋 Select "${label}" → dropdown opened`);
		// Close via Escape without selecting anything
		await page.keyboard.press('Escape');
		await Bun.sleep(200);
	} else {
		console.log(`   📋 Select "${label}" → clicked (no listbox detected)`);
	}

	results.addClickedElement(`select "${label}"`, pageUrl, true, 'select-open');
	results.selectsTested++;
}
