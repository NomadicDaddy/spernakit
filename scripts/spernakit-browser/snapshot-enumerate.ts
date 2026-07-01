/**
 * In-page interactive element enumerator for the snapshot/ref system.
 *
 * Walks the DOM in document order, discovers all interactive elements,
 * computes accessible names, and generates CSS selectors for re-location.
 *
 * Must be fully self-contained (no external imports — runs in browser
 * context via page.evaluate()).
 */
export function enumerateInteractiveElements(): {
	checked?: boolean;
	disabled?: boolean;
	name: string;
	role: string;
	selector: string;
	value?: string;
}[] {
	const results: {
		checked?: boolean;
		disabled?: boolean;
		name: string;
		role: string;
		selector: string;
		value?: string;
	}[] = [];

	// --- Accessible name computation ---

	function getAccessibleName(el: Element): string {
		// 1. aria-label
		const ariaLabel = el.getAttribute('aria-label');
		if (ariaLabel?.trim()) return ariaLabel.trim();

		// 2. aria-labelledby
		const labelledBy = el.getAttribute('aria-labelledby');
		if (labelledBy) {
			const parts = labelledBy
				.split(/\s+/)
				.map((id) => document.getElementById(id)?.textContent?.trim())
				.filter(Boolean);
			if (parts.length > 0) return parts.join(' ');
		}

		// 3. <label for="id"> association
		const id = el.getAttribute('id');
		if (id) {
			const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
			if (label?.textContent?.trim()) return label.textContent.trim();
		}

		// 4. Wrapping <label> ancestor
		const parentLabel = el.closest('label');
		if (parentLabel) {
			// Get label text excluding the element's own text
			const clone = parentLabel.cloneNode(true) as HTMLElement;
			const inputs = clone.querySelectorAll('input, select, textarea, button');
			inputs.forEach((inp) => inp.remove());
			const labelText = clone.textContent?.trim();
			if (labelText) return labelText;
		}

		// 5. placeholder (for inputs/textareas)
		const placeholder = el.getAttribute('placeholder');
		if (placeholder?.trim()) return placeholder.trim();

		// 6. Direct text content (truncated)
		const textContent = el.textContent?.trim();
		if (textContent) return textContent.substring(0, 80);

		// 7. title attribute
		const title = el.getAttribute('title');
		if (title?.trim()) return title.trim();

		// 8. alt attribute (images in buttons)
		const img = el.querySelector('img[alt]');
		if (img) {
			const alt = img.getAttribute('alt');
			if (alt?.trim()) return alt.trim();
		}

		// 9. SVG title
		const svgTitle = el.querySelector('svg title');
		if (svgTitle?.textContent?.trim()) return svgTitle.textContent.trim();

		return '';
	}

	// --- CSS selector generation ---

	function generateSelector(el: Element): string {
		// Prefer id-based selectors
		if (el.id) return `#${CSS.escape(el.id)}`;

		// Build a path from the element to a known ancestor
		const parts: string[] = [];
		let current: Element | null = el;
		let depth = 0;

		while (current && depth < 5) {
			if (current.id) {
				parts.unshift(`#${CSS.escape(current.id)}`);
				break;
			}

			const tag = current.tagName.toLowerCase();
			const parent: Element | null = current.parentElement;

			if (parent) {
				const currentTag = current.tagName;
				const siblings = Array.from(parent.children).filter(
					(c: Element) => c.tagName === currentTag
				);
				if (siblings.length > 1) {
					const idx = siblings.indexOf(current) + 1;
					parts.unshift(`${tag}:nth-of-type(${idx})`);
				} else {
					parts.unshift(tag);
				}
			} else {
				parts.unshift(tag);
			}

			current = parent;
			depth++;
		}

		return parts.join(' > ');
	}

	// --- Element classification ---

	function getRole(el: Element): null | string {
		const tag = el.tagName.toLowerCase();
		const type = el.getAttribute('type')?.toLowerCase();
		const role = el.getAttribute('role')?.toLowerCase();

		// Explicit ARIA role
		if (role === 'switch') return 'switch';
		if (role === 'combobox') return 'combobox';
		if (role === 'tab') return 'tab';
		if (role === 'menuitem') return 'menuitem';
		if (role === 'option') return 'option';
		if (role === 'slider') return 'slider';
		if (role === 'spinbutton') return 'spinbutton';

		// Standard HTML elements
		if (tag === 'a' && el.hasAttribute('href')) return 'link';
		if (tag === 'button') return 'button';
		if (tag === 'select') return 'select';
		if (tag === 'textarea') return 'textbox';

		if (tag === 'input') {
			if (type === 'checkbox') return 'checkbox';
			if (type === 'radio') return 'radio';
			if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
			if (type === 'range') return 'slider';
			if (type === 'file') return 'file';
			// text, email, password, search, url, tel, number, date, etc.
			return 'textbox';
		}

		// contenteditable
		if (el.getAttribute('contenteditable') === 'true') return 'textbox';

		// Generic interactive elements with click handlers
		if (role === 'button') return 'button';
		if (role === 'link') return 'link';

		return null;
	}

	function isVisible(el: Element): boolean {
		const style = window.getComputedStyle(el);
		if (style.display === 'none') return false;
		if (style.visibility === 'hidden') return false;
		if (style.opacity === '0') return false;

		const rect = el.getBoundingClientRect();
		// Allow elements with zero dimensions if they're in the DOM
		// (some inputs are visually hidden but still interactive)
		if (rect.width === 0 && rect.height === 0) {
			// Check if it's truly hidden or just a zero-dimension interactive element
			if (style.position === 'absolute' && style.overflow === 'hidden') return false;
		}

		return true;
	}

	function isInteractive(el: Element): boolean {
		const tag = el.tagName.toLowerCase();
		const role = el.getAttribute('role')?.toLowerCase();

		// Standard interactive elements
		if (tag === 'a' && el.hasAttribute('href')) return true;
		if (tag === 'button') return true;
		if (tag === 'input') return true;
		if (tag === 'select') return true;
		if (tag === 'textarea') return true;

		// ARIA roles
		if (
			role === 'button' ||
			role === 'link' ||
			role === 'switch' ||
			role === 'combobox' ||
			role === 'tab' ||
			role === 'menuitem' ||
			role === 'option' ||
			role === 'slider' ||
			role === 'spinbutton'
		)
			return true;

		// contenteditable
		if (el.getAttribute('contenteditable') === 'true') return true;

		return false;
	}

	// --- DOM tree walk (document order) ---

	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
		acceptNode(node: Node) {
			const el = node as Element;
			// Skip hidden containers entirely
			if (!isVisible(el)) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	let node: Node | null = walker.currentNode;
	while (node) {
		const el = node as Element;

		if (isInteractive(el)) {
			const role = getRole(el);
			if (role) {
				const name = getAccessibleName(el);
				const selector = generateSelector(el);
				const disabled =
					el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

				const entry: {
					checked?: boolean;
					disabled?: boolean;
					name: string;
					role: string;
					selector: string;
					value?: string;
				} = { name, role, selector };

				if (disabled) entry.disabled = true;

				// Capture value/state
				const tag = el.tagName.toLowerCase();
				const type = el.getAttribute('type')?.toLowerCase();

				if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
					entry.checked = (el as HTMLInputElement).checked;
				} else if (role === 'switch') {
					entry.checked = el.getAttribute('aria-checked') === 'true';
				} else if (
					tag === 'input' ||
					tag === 'textarea' ||
					el.getAttribute('contenteditable') === 'true'
				) {
					const val = (el as HTMLInputElement).value ?? el.textContent ?? '';
					// 500-char cap fits long URLs (e.g. 64-hex share tokens appended to
					// an origin + path ~100 chars) without dumping megabyte-sized
					// textarea contents. Lowering this caused a false-positive share-
					// dashboard 404 during testing when the tail of the token got
					// lopped off the displayed value.
					if (val.trim()) entry.value = val.trim().substring(0, 500);
				} else if (tag === 'select') {
					const sel = el as HTMLSelectElement;
					const option = sel.options[sel.selectedIndex];
					if (option) entry.value = option.textContent?.trim() ?? option.value;
				} else if (role === 'combobox') {
					// shadcn/ui combobox: button[role="combobox"] displays selected value as text
					const val = el.textContent?.trim();
					if (val) entry.value = val.substring(0, 500);
				}

				results.push(entry);
			}
		}

		node = walker.nextNode();
	}

	return results;
}
