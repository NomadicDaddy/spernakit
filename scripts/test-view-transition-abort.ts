#!/usr/bin/env bun
/**
 * Regression coverage for an interrupted view transition staying quiet
 * (`.aidd/features/remediation-20260827-interrupted-view-transition-raises-aborterror`).
 *
 * The defect this gate was written for: the template opts every application into browser-native
 * cross-document view transitions with a bare `@view-transition { navigation: auto }` rule, and
 * navigating again before the 220ms animation finished rejected the skipped transition's promises
 * with an `AbortError` that nothing anywhere held. It surfaced as an unhandled rejection in the
 * console and in any harness that counts one as a failure. Every page could produce it by being
 * clicked twice, and a crawler navigating faster than the animation produced it on every page.
 *
 * The property under test is that the skip has somewhere to land and nothing else does: two
 * navigations inside the animation window raise nothing, a transition that failed for another
 * reason is still reported, and a navigation that ran no transition is not touched at all. The
 * three source scans below cover what an assertion cannot reach: the CSS the transitions come
 * from, the one place the handling is wired in, and the crawl harness, which must stay able to
 * fail on this noise rather than being taught to ignore it.
 *
 * Runs in process. `initViewTransitions` takes the window to subscribe on, so this gate hands it
 * an `EventTarget` of its own and dispatches the navigations at it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initViewTransitions } from '../frontend/src/lib/viewTransitions.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** Every rejection that reached the runtime with nobody holding it. */
const unhandled: unknown[] = [];
process.on('unhandledRejection', (reason: unknown) => {
	unhandled.push(reason);
});

/** A promise this gate settles itself, standing in for one the browser settles. */
interface Deferred {
	promise: Promise<unknown>;
	reject: (reason: unknown) => void;
	resolve: () => void;
}

function deferred(): Deferred {
	let reject: (reason: unknown) => void = () => undefined;
	let resolve: () => void = () => undefined;
	const promise = new Promise<unknown>((res, rej) => {
		reject = rej;
		resolve = () => {
			res(undefined);
		};
	});
	return { promise, reject, resolve };
}

/** The error the browser rejects with when a transition is skipped. */
function skipError(): Error {
	const error = new Error('Transition was skipped');
	error.name = 'AbortError';
	return error;
}

/**
 * One navigation, carrying a transition or carrying none.
 *
 * @param target - The window the module subscribed on.
 * @param type - `pagereveal` for the page being revealed, `pageswap` for the one being left.
 * @param ready - The transition's `ready` promise, or null for a navigation that ran no transition.
 */
function navigate(target: EventTarget, type: string, ready: null | Promise<unknown>): void {
	const event = new Event(type) as { viewTransition: { ready: Promise<unknown> } | null } & Event;
	event.viewTransition = ready === null ? null : { ready };
	target.dispatchEvent(event);
}

/** Let the runtime report anything it is going to report about the rejections raised so far. */
function settle(): Promise<void> {
	return new Promise((res) => setTimeout(res, 50));
}

/**
 * Two navigations inside the animation window raise nothing.
 *
 * Specs 1 and 7. The first navigation's transition is still running when the second one starts,
 * which is what skips it, so the rejection arrives after the second navigation has already been
 * dispatched. That ordering is the case the record was filed about; a gate that rejected the first
 * transition before the second navigation would be testing a quieter situation than the real one.
 */
async function interruptedNavigationIsQuiet(target: EventTarget): Promise<void> {
	const first = deferred();
	navigate(target, 'pageswap', first.promise);

	const second = deferred();
	navigate(target, 'pagereveal', second.promise);

	first.reject(skipError());
	await settle();
	assert(
		unhandled.length === 0,
		`interrupting a transition must raise nothing, got ${JSON.stringify(unhandled.map(String))}`,
	);

	second.resolve();
	await settle();
	assert(
		unhandled.length === 0,
		'a transition that completed after an interrupted one must also raise nothing',
	);
}

/**
 * A transition that failed for some other reason is still reported.
 *
 * Spec 2. The absorbing is the whole risk in this fix: a handler that swallowed every rejection
 * from these promises would turn a real failure into silence, and would read as a pass here.
 */
async function anUnrelatedFailureStillSurfaces(target: EventTarget): Promise<void> {
	const broken = deferred();
	navigate(target, 'pagereveal', broken.promise);
	const cause = new TypeError('the transition could not be started');
	broken.reject(cause);
	await settle();

	assert(
		unhandled.length === 1,
		`an unrelated failure must be reported, got ${unhandled.length}`,
	);
	assert(
		unhandled[0] === cause,
		'the reported rejection must be the failure itself, not something wrapped around it',
	);
	unhandled.length = 0;
}

/**
 * A rejection from anywhere else is untouched.
 *
 * Spec 2 again, from the other side. Nothing here is a global handler, so a rejection the
 * application raised for its own reasons has to reach the runtime exactly as before.
 */
async function anUnrelatedRejectionIsUntouched(): Promise<void> {
	const loose = new Error('an ordinary failure somewhere in the application');
	void Promise.reject(loose);
	await settle();

	assert(
		unhandled.length === 1,
		`an unrelated rejection must still surface, got ${unhandled.length}`,
	);
	assert(unhandled[0] === loose, 'the rejection that surfaced must be the one that was raised');
	unhandled.length = 0;
}

/**
 * A navigation that ran no transition is not touched.
 *
 * Spec 5. An application that drops the `@view-transition` block from its CSS gets this on every
 * navigation, so the handling has to be inert rather than merely harmless.
 */
async function aNavigationWithoutATransitionIsInert(target: EventTarget): Promise<void> {
	navigate(target, 'pagereveal', null);
	navigate(target, 'pageswap', null);
	await settle();
	assert(
		unhandled.length === 0,
		'a navigation that ran no transition must not produce anything to report',
	);
}

/**
 * The transitions themselves are unchanged, and the handling is wired in one place.
 *
 * Specs 3 and 4. The fix is meant to be invisible: the same rule, the same 220ms, the same
 * reduced-motion block ahead of it, and a single call next to the stylesheet that starts them, so
 * an application inheriting the CSS inherits the handling rather than wiring it per page.
 */
function theTransitionsAreUnchanged(): void {
	const css = readFileSync(join(repoRoot, 'frontend', 'src', 'tailwind.css'), 'utf8');
	assert(css.includes('navigation: auto'), 'the view-transition opt-in must still be declared');
	assert(
		css.includes('animation-duration: 220ms'),
		'the 220ms transition timing must be unchanged',
	);
	const reducedMotion = css.indexOf('prefers-reduced-motion');
	const transitionBlock = css.indexOf('@supports (view-transition-name: root)');
	assert(
		reducedMotion !== -1 && reducedMotion < transitionBlock,
		'the reduced-motion block must still come before the transition block it governs',
	);

	const main = readFileSync(join(repoRoot, 'frontend', 'src', 'main.tsx'), 'utf8');
	assert(
		main.includes('initViewTransitions(window)'),
		'main.tsx must subscribe, so the handling ships with the stylesheet rather than per page',
	);
}

/**
 * The crawl still fails on this noise if it ever comes back.
 *
 * Spec 6. A crawler navigating faster than the animation is the ordinary way this is hit, so the
 * crawl has to pass because the application is quiet, not because the harness was taught to ignore
 * the message. Teaching it to ignore the message is the cheap way to make this record's symptom go
 * away, and it would take every future transition failure with it.
 */
function theCrawlIsNotTaughtToIgnoreIt(): void {
	for (const file of ['crawltest-events.ts', 'crawltest-types.ts']) {
		const source = readFileSync(join(repoRoot, 'scripts', file), 'utf8');
		assert(
			!/transition was skipped/i.test(source) && !/view-transition/i.test(source),
			`scripts/${file} must not suppress the skipped-transition message`,
		);
	}
}

async function run(): Promise<void> {
	const target = new EventTarget();
	initViewTransitions(target);

	await interruptedNavigationIsQuiet(target);
	await anUnrelatedFailureStillSurfaces(target);
	await anUnrelatedRejectionIsUntouched();
	await aNavigationWithoutATransitionIsInert(target);
	theTransitionsAreUnchanged();
	theCrawlIsNotTaughtToIgnoreIt();

	if (failures.length === 0) {
		console.log('[OK] view-transition-abort: an interrupted transition raises nothing');
		process.exit(0);
	}
	console.error('[FAIL] view-transition-abort:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-view-transition-abort:', err);
	process.exit(1);
});
