/** Options for {@link scrollIntoViewWithin}. */
interface ScrollIntoViewWithinOptions {
	/** Breathing room to leave above the target, in pixels. */
	offset?: number;
	/**
	 * The container to move. Defaults to the target's nearest scrollable ancestor, which is what
	 * a caller wants unless it means a specific one — a rail scrolling its own items, say.
	 */
	scroller?: HTMLElement | null | undefined;
}

/**
 * The nearest ancestor that both can scroll vertically and currently has somewhere to scroll.
 *
 * The overflow test alone is not enough: `main` in this app is `overflow-y-auto` on every page,
 * so an element inside a short page would resolve to a container with no scroll range and the
 * call would silently do nothing while a real scroller sat further out.
 */
function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
	let current = element.parentElement;
	while (current) {
		const overflowY = getComputedStyle(current).overflowY;
		if (
			(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
			current.scrollHeight > current.clientHeight
		) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

/**
 * Bring `target` into view by scrolling exactly one container.
 *
 * `Element.scrollIntoView` cannot do this. It scrolls **every** scrollable ancestor until the
 * element is visible in all of them, so calling it on something inside a horizontally scrolling
 * rail also yanks the page, the tab panel, and anything else in the chain — a jump the user did not
 * ask for and cannot predict. There is no option to scope it; `block`/`inline` choose the alignment
 * within each ancestor, not which ancestors take part.
 *
 * So the offset is computed against one container and written to that container's `scrollTop`.
 * Everything else stays where the user left it.
 *
 * Honours `prefers-reduced-motion`: a smooth scroll is a large unrequested movement, which is
 * precisely what that setting is about.
 *
 * @param target - The element to reveal.
 * @param options - See {@link ScrollIntoViewWithinOptions}.
 */
function scrollIntoViewWithin(
	target: HTMLElement,
	{ offset = 0, scroller }: ScrollIntoViewWithinOptions = {},
): void {
	const container = scroller ?? findScrollableAncestor(target);
	if (!container) return;

	const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		? 'auto'
		: 'smooth';
	const targetTop = target.getBoundingClientRect().top;

	// The root scroller reports its own rect relative to the viewport it is scrolling, so the
	// container-relative arithmetic below double-counts the current offset for it.
	if (container === document.documentElement || container === document.body) {
		window.scrollTo({ behavior, top: targetTop + window.scrollY - offset });
		return;
	}

	const top = targetTop - container.getBoundingClientRect().top + container.scrollTop - offset;
	container.scrollTo({ behavior, top });
}

export { findScrollableAncestor, scrollIntoViewWithin };
export type { ScrollIntoViewWithinOptions };
