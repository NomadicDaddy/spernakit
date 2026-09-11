/**
 * Where focus should go when an overlay closes.
 *
 * Radix's modal content cancels the browser's own focus restore and hands focus to its
 * `DialogTrigger`/`AlertDialogTrigger`. Almost nothing in this app uses those triggers — dialogs are
 * controlled by a parent's state and opened from a button somewhere else — so the trigger ref is
 * null, its `?.focus()` is a no-op, and focus lands on `<body>`. A keyboard user who dismisses a
 * dialog is dropped to the top of the document and has to tab through the whole sidebar, header and
 * toolbar to get back to the row they were on. That is WCAG 2.4.3, on every dismissal.
 *
 * `document.activeElement` alone is not enough to fix it. The common case here is a data-table row
 * menu: the user clicks "Edit" in a `DropdownMenu`, and that one click both closes the menu and
 * opens the dialog. The menu item is still attached when the dialog's focus scope reads the active
 * element, so it looks like a usable answer, and it is gone by the time the dialog is dismissed —
 * at which point focusing it would put focus on `<body>`, the thing this exists to prevent. What
 * the user should get back is the row's menu button.
 *
 * That button is not in the focus history either. Radix opens a menu by moving focus from the
 * trigger into the menu content in one step, and the trigger never raises a `focusin` of its own,
 * so no record of it is made. It has to be found rather than remembered: menu content carries
 * `aria-labelledby` pointing at the trigger's id, which is how a candidate inside a menu is turned
 * into the button that opened it.
 *
 * The history covers the rest — an opener that has already handed focus on by the time the overlay
 * mounts — with the most recent entry that is still attached winning.
 */

/**
 * Eight is enough to span the openers this app actually produces while keeping the array short
 * enough that nothing is retained for long. Entries are dropped as they age out, and a detached
 * element is skipped rather than held on to, so this does not keep removed DOM alive.
 */
const HISTORY_LIMIT = 8;

/**
 * Radix renders `DropdownMenu` content, its sub-content, and every item inside them under
 * `role="menu"`, and unmounts the lot when the menu closes. This app has no menubar and no context
 * menu, so nothing matching this stays on the page.
 */
const MENU_CONTENT = '[role="menu"]';

/**
 * How many menus deep to keep walking out toward a trigger that is not itself in a menu.
 *
 * A submenu's trigger is a menu item in its parent's content, so one hop is not always enough. This
 * app nests one level; the bound is here so that a malformed or circular `aria-labelledby` cannot
 * spin rather than because the depth is expected.
 */
const MENU_HOPS = 4;

const history: HTMLElement[] = [];

let isTracking = false;

function record(element: HTMLElement) {
	// Re-focusing an element moves it to the front rather than adding a duplicate, so the history
	// spans that many *distinct* elements.
	const existing = history.indexOf(element);
	if (existing !== -1) history.splice(existing, 1);

	history.push(element);
	if (history.length > HISTORY_LIMIT) history.shift();
}

/**
 * Begin recording focus history. Safe to call repeatedly; only the first call registers a listener.
 *
 * Called from the overlay components rather than at module load so that importing this module has
 * no side effect, and so nothing is tracked in an environment without a document.
 */
function trackFocusHistory() {
	if (isTracking || typeof document === 'undefined') return;
	isTracking = true;

	// Capture phase: focus events do not bubble, so a listener on the document only sees them here.
	document.addEventListener(
		'focusin',
		(event) => {
			if (event.target instanceof HTMLElement) record(event.target);
		},
		true,
	);
}

function isUsableOrigin(element: HTMLElement | null): element is HTMLElement {
	// `<body>` is excluded deliberately: it is where focus lands when it has been lost, so returning
	// it would be indistinguishable from the defect this exists to fix.
	return !!element && element.isConnected && element !== document.body;
}

/**
 * The button a menu was opened from, given anything inside that menu's content.
 *
 * @param element - A candidate known to sit inside `[role="menu"]`.
 * @returns The trigger the menu names in `aria-labelledby`, or `null` when there is no such link.
 */
function menuTrigger(element: HTMLElement): HTMLElement | null {
	const triggerId = element.closest(MENU_CONTENT)?.getAttribute('aria-labelledby');
	if (!triggerId) return null;

	const trigger = document.getElementById(triggerId);
	return trigger instanceof HTMLElement ? trigger : null;
}

/**
 * Turn one focus candidate into somewhere focus can still be returned to, or `null`.
 *
 * @param candidate - An element that held focus.
 * @returns The candidate itself, the trigger of the menu it belongs to, or `null` if neither is
 *   usable.
 */
function resolveOrigin(candidate: HTMLElement | undefined): HTMLElement | null {
	let element: HTMLElement | null = candidate ?? null;

	for (let hop = 0; element !== null && hop <= MENU_HOPS; hop++) {
		if (!element.closest(MENU_CONTENT)) return isUsableOrigin(element) ? element : null;
		element = menuTrigger(element);
	}

	return null;
}

/**
 * The element an overlay opened from, or `null` when none of the recent history is still usable —
 * in which case the caller should leave the overlay's own default behaviour alone.
 *
 * Read this while the overlay is opening, before it moves focus into itself.
 */
function getFocusOrigin(): HTMLElement | null {
	const active = document.activeElement;
	if (active instanceof HTMLElement) {
		const resolved = resolveOrigin(active);
		if (resolved) return resolved;
	}

	for (let index = history.length - 1; index >= 0; index--) {
		const resolved = resolveOrigin(history[index]);
		if (resolved) return resolved;
	}

	return null;
}

export { getFocusOrigin, trackFocusHistory };
