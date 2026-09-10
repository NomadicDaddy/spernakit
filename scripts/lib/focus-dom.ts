/**
 * focus-dom.ts
 *
 * Enough of a document for a gate to run `frontend/src/lib/focusReturn.ts` against the element
 * shapes a real browser produces, without a headless browser and without a DOM library.
 *
 * `frontend-render.ts` deliberately stops short of a DOM because the question it answers is what a
 * component renders. The focus-origin rule is a different kind of question: it is about which node
 * is handed back after another one has been removed, so it needs parents, attributes, an active
 * element and a notion of being attached. It needs nothing else, and this provides nothing else.
 *
 * The surface is kept to exactly what `focusReturn.ts` touches, and `closest` accepts only the
 * `[name="value"]` selector form and throws on anything richer. A stand-in that quietly returned
 * `null` for a selector it did not understand would let the module under test pass a gate by not
 * being exercised, so an unsupported selector is a failure rather than a miss.
 */

interface FocusListener {
	(event: { target: FocusElement }): void;
}

const ATTRIBUTE_SELECTOR = /^\[([\w-]+)="([^"]*)"\]$/u;

/** An element: a tag, some attributes, a parent, and children. */
class FocusElement {
	readonly attributes = new Map<string, string>();

	readonly children: FocusElement[] = [];

	parent: FocusElement | null = null;

	readonly tagName: string;

	constructor(tagName: string, attributes: Record<string, string> = {}) {
		this.tagName = tagName.toUpperCase();
		for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
	}

	/** True while this element can be reached from the document root. */
	get isConnected(): boolean {
		return isAttached(this);
	}

	/**
	 * Attach children, in order.
	 *
	 * @param children - The elements to append.
	 * @returns This element, so a tree can be built in one expression.
	 */
	append(...children: FocusElement[]): FocusElement {
		for (const child of children) {
			child.parent = this;
			this.children.push(child);
		}
		return this;
	}

	/**
	 * The nearest self-or-ancestor matching an attribute selector.
	 *
	 * @param selector - A selector of the form `[name="value"]`.
	 * @returns The matching element, or `null`.
	 */
	closest(selector: string): FocusElement | null {
		const parsed = ATTRIBUTE_SELECTOR.exec(selector);
		if (!parsed) {
			throw new Error(
				`focus-dom only understands [name="value"] selectors; received ${selector}. ` +
					'Widen this stand-in rather than letting the rule under test go unexercised.',
			);
		}

		return nearest(this, parsed[1] ?? '', parsed[2] ?? '');
	}

	/**
	 * Read one attribute.
	 *
	 * @param name - The attribute name.
	 * @returns Its value, or `null` when the element does not carry it.
	 */
	getAttribute(name: string): null | string {
		return this.attributes.get(name) ?? null;
	}

	/** Detach this element from its parent, the way unmounting a menu detaches its content. */
	remove(): void {
		const siblings = this.parent?.children;
		if (siblings) siblings.splice(siblings.indexOf(this), 1);
		this.parent = null;
	}
}

/**
 * Walk from an element to the document root.
 *
 * @param start - Where to begin.
 * @returns Whether the root was reached.
 */
function isAttached(start: FocusElement): boolean {
	let node: FocusElement | null = start;
	while (node !== null) {
		if (node === documentElement) return true;
		node = node.parent;
	}
	return false;
}

/**
 * The nearest self-or-ancestor carrying an attribute with a given value.
 *
 * @param start - Where to begin.
 * @param name - The attribute name.
 * @param value - The value it must have.
 * @returns The matching element, or `null`.
 */
function nearest(start: FocusElement, name: string, value: string): FocusElement | null {
	let node: FocusElement | null = start;
	while (node !== null) {
		if (node.attributes.get(name) === value) return node;
		node = node.parent;
	}
	return null;
}

const documentElement = new FocusElement('html');
const body = new FocusElement('body');
documentElement.append(body);

const listeners: FocusListener[] = [];

let activeElement: FocusElement = body;

/**
 * Find an element by id, searching only what is attached.
 *
 * @param id - The id to look for.
 * @param from - Where to start; the document root by default.
 * @returns The element, or `null`.
 */
function findById(id: string, from: FocusElement = documentElement): FocusElement | null {
	if (from.getAttribute('id') === id) return from;
	for (const child of from.children) {
		const found = findById(id, child);
		if (found) return found;
	}
	return null;
}

const documentStandIn = {
	get activeElement() {
		return activeElement;
	},
	addEventListener: (type: string, listener: FocusListener, capture?: boolean) => {
		if (type !== 'focusin' || capture !== true) {
			throw new Error(`focus-dom only serves a capturing focusin listener; received ${type}`);
		}
		listeners.push(listener);
	},
	body,
	documentElement,
	getElementById: (id: string) => findById(id),
};

/**
 * Put the stand-in document and element class in place of the browser's.
 *
 * Call this before importing anything under `frontend/src`: `focusReturn.ts` reads `document` and
 * `HTMLElement` as globals from the first call onward.
 */
function installFocusDom(): void {
	const scope = globalThis as unknown as Record<string, unknown>;
	scope.document = documentStandIn;
	scope.HTMLElement = FocusElement;
}

/**
 * Build an element.
 *
 * @param tagName - The tag.
 * @param attributes - Attributes to set on it.
 * @returns The new element, detached.
 */
function element(tagName: string, attributes: Record<string, string> = {}): FocusElement {
	return new FocusElement(tagName, attributes);
}

/**
 * Move focus, the way the browser does: set the active element and raise `focusin` on it.
 *
 * @param target - The element receiving focus.
 */
function focus(target: FocusElement): void {
	activeElement = target;
	for (const listener of listeners) listener({ target });
}

/** Put focus back on `<body>`, which is where the browser leaves it when it has been lost. */
function blur(): void {
	activeElement = body;
}

export { blur, body, element, focus, FocusElement, installFocusDom };
