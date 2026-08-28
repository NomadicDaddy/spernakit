/**
 * Absorb the rejection a skipped view transition raises, and nothing else.
 *
 * `tailwind.css` opts every navigation into a browser-native cross-document view transition with
 * `@view-transition { navigation: auto }`. Navigating again before the 220ms animation has finished
 * skips the running transition, and a skipped transition rejects its own promises with an
 * `AbortError`. Nothing held those promises, so the rejection surfaced as an unhandled rejection in
 * the console and in any harness that counts one as a failure. The navigation itself is unaffected,
 * which is why it reads as noise rather than breakage, but it is noise any page produces by being
 * clicked twice, and a crawler navigating faster than the animation produces it on every page.
 *
 * The handling attaches to the promises of one particular transition, at the moment the browser
 * hands that transition over. That is what keeps it from becoming a console silencer: a rejection
 * from anywhere else in the application is never seen here, and a transition that failed for a
 * reason other than being skipped is put back.
 *
 * An application that drops the `@view-transition` block from its CSS runs no transition, so
 * `viewTransition` is null on every event and nothing is ever attached. Reading the stylesheet up
 * front to decide whether to subscribe at all was the alternative, and it is worse: in development
 * Vite injects the stylesheet after this module first runs, so the check would answer "no rule" on
 * exactly the pages that have one.
 */

/** The slice of a `ViewTransition` this needs: the promises that can reject. */
interface SkippableTransition {
	finished?: Promise<unknown>;
	ready?: Promise<unknown>;
	updateCallbackDone?: Promise<unknown>;
}

/** `pagereveal` and `pageswap` carry the transition the navigation is running, or null. */
interface TransitionCarryingEvent extends Event {
	viewTransition?: null | SkippableTransition;
}

/**
 * Just enough of `window` to subscribe.
 *
 * Narrow on purpose: it lets a gate hand this module an `EventTarget` of its own and dispatch two
 * navigations at it, which is the case the fix exists for and the one a static render cannot reach.
 */
interface TransitionEventTarget {
	addEventListener: (type: string, listener: (event: Event) => void) => void;
}

/** The two events a cross-document transition is handed over on: the old page, then the new one. */
const TRANSITION_EVENTS = ['pagereveal', 'pageswap'];

/**
 * Whether this rejection is the transition being skipped.
 *
 * Matched on the error name rather than the message, because the message is the browser's wording
 * and differs between engines. A view transition's own promises reject with `AbortError` when the
 * transition is skipped and for no other reason, so the name is the whole test on these promises.
 *
 * @param reason - Whatever the promise rejected with.
 * @returns True when the rejection is a skip.
 */
function isSkipped(reason: unknown): boolean {
	return reason instanceof Error && reason.name === 'AbortError';
}

/**
 * Hold one of a transition's promises, so a skip has somewhere to land.
 *
 * @param promise - A promise belonging to the transition, if the browser exposes it.
 */
function absorbSkip(promise: Promise<unknown> | undefined): void {
	promise?.catch((reason: unknown) => {
		if (isSkipped(reason)) return;
		// Not the skip. Put it back: a transition that failed for another reason should be reported
		// exactly as it would have been if this module were not here.
		throw reason;
	});
}

/**
 * Take hold of the transition this navigation is running, if it is running one.
 *
 * @param event - The `pagereveal` or `pageswap` event.
 */
function handleNavigation(event: Event): void {
	const { viewTransition } = event as TransitionCarryingEvent;
	if (!viewTransition) return;
	absorbSkip(viewTransition.ready);
	absorbSkip(viewTransition.finished);
	absorbSkip(viewTransition.updateCallbackDone);
}

/**
 * Subscribe to the navigation events that carry a view transition.
 *
 * Called once from `main.tsx`, alongside the stylesheet that starts the transitions, so an
 * application inheriting the template CSS inherits the handling with it.
 *
 * @param target - The window to subscribe on.
 */
function initViewTransitions(target: TransitionEventTarget): void {
	for (const name of TRANSITION_EVENTS) target.addEventListener(name, handleNavigation);
}

export { initViewTransitions };
