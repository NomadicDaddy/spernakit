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
 * opens the dialog. React commits the unmount and the mount together, so by the time the dialog's
 * focus scope runs, the menu item that opened it is already detached and focus has fallen to
 * `<body>` — there is nothing left to read. What the user should get back is the row's menu button,
 * which is one step further back than any single snapshot can see.
 *
 * Hence a short history. A capturing `focusin` listener records what has held focus, and the
 * opener is the most recent entry still attached to the document.
 */

/**
 * Eight is enough to step back past a menu item and its menu content to the trigger that opened
 * them, which is the longest chain this app actually produces, while keeping the array short enough
 * that nothing is retained for long. Entries are dropped as they age out, and a detached element is
 * skipped rather than held on to, so this does not keep removed DOM alive.
 */
const HISTORY_LIMIT = 8;

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

function isUsableOrigin(element: HTMLElement | undefined): element is HTMLElement {
	// `<body>` is excluded deliberately: it is where focus lands when it has been lost, so returning
	// it would be indistinguishable from the defect this exists to fix.
	return !!element && element.isConnected && element !== document.body;
}

/**
 * The element an overlay opened from, or `null` when none of the recent history is still usable —
 * in which case the caller should leave the overlay's own default behaviour alone.
 *
 * Read this while the overlay is opening, before it moves focus into itself.
 */
function getFocusOrigin(): HTMLElement | null {
	const active = document.activeElement;
	if (active instanceof HTMLElement && isUsableOrigin(active)) return active;

	for (let index = history.length - 1; index >= 0; index--) {
		const candidate = history[index];
		if (isUsableOrigin(candidate)) return candidate;
	}

	return null;
}

export { getFocusOrigin, trackFocusHistory };
