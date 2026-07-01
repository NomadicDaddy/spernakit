/**
 * DOM enumeration engine for the snapshot/ref system.
 *
 * Walks the DOM in document order, discovers all interactive elements,
 * computes accessible names, and produces @eN refs with a textual tree
 * that AI agents can read and reason about.
 */
import type { Page } from 'puppeteer';

import type { RefEntry, SnapshotResult } from './types';

import { enumerateInteractiveElements } from './snapshot-enumerate.ts';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Take a snapshot of the current page, enumerating interactive elements. */
export async function takeSnapshot(page: Page, interactive: boolean): Promise<SnapshotResult> {
	const url = page.url();
	const title = await page.title();

	if (!interactive) {
		return { refs: [], text: `URL: ${url}\nTitle: ${title}\n`, title, url };
	}

	const rawElements = await page.evaluate(enumerateInteractiveElements);

	const refs: RefEntry[] = rawElements.map((el) => {
		const entry: RefEntry = { name: el.name, role: el.role, selector: el.selector };
		if (el.checked !== undefined) entry.checked = el.checked;
		if (el.disabled !== undefined) entry.disabled = el.disabled;
		if (el.value !== undefined) entry.value = el.value;
		return entry;
	});

	// Build textual tree output
	const lines: string[] = [`URL: ${url}`, `Title: ${title}`, ''];

	for (const [i, ref] of refs.entries()) {
		const refLabel = `@e${i + 1}`;
		let line = `${refLabel} ${ref.role}`;

		if (ref.name) line += ` "${ref.name}"`;
		if (ref.value) line += ` value="${ref.value}"`;
		if (ref.checked === true) line += ' checked';
		if (ref.checked === false && (ref.role === 'checkbox' || ref.role === 'radio'))
			line += ' unchecked';
		if (ref.disabled) line += ' disabled';

		lines.push(line);
	}

	return { refs, text: lines.join('\n'), title, url };
}

/**
 * Resolve a ref string (e.g. "@e3") to its RefEntry.
 * Returns null if the ref is invalid or out of range.
 */
export function resolveRef(refs: RefEntry[], refStr: string): null | RefEntry {
	const match = refStr.match(/^@e(\d+)$/);
	if (!match?.[1]) return null;

	const index = parseInt(match[1], 10) - 1;
	if (index < 0 || index >= refs.length) return null;

	return refs[index] ?? null;
}

/**
 * Re-enumerate elements and locate the element matching the given ref index.
 * Returns the element handle for interaction, or null if not found.
 */
export async function locateElement(page: Page, refs: RefEntry[], refStr: string) {
	const ref = resolveRef(refs, refStr);
	if (!ref) return null;

	// Try CSS selector first
	const handle = await page.$(ref.selector);
	if (handle) return handle;

	// Fallback: re-enumerate and match by position
	const match = refStr.match(/^@e(\d+)$/);
	if (!match?.[1]) return null;

	const targetIndex = parseInt(match[1], 10) - 1;
	const freshElements = await page.evaluate(enumerateInteractiveElements);
	const freshEntry = freshElements[targetIndex];

	if (targetIndex >= 0 && freshEntry) {
		return page.$(freshEntry.selector);
	}

	return null;
}
