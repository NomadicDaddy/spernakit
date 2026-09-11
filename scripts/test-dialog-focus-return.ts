#!/usr/bin/env bun
/**
 * Regression coverage for focus after a dialog opened from a data-table row menu is dismissed.
 *
 * The defect this gate was written for: on Workspaces and Settings > Users, opening the row's
 * actions menu and choosing Members or Edit gave a dialog whose dismissal put focus on `<body>`.
 * All table context was gone, and the next Tab started again from the top of the document, so
 * getting back to the row meant tabbing through the sidebar, the header and the toolbar. Doing the
 * same thing from a plain button, Create Workspace, returned focus correctly, which is what made
 * the row menu look like a rendering problem rather than a focus one.
 *
 * The cause was that a menu item is not a place focus can be returned to. Radix keeps the item
 * attached while the click that opened the dialog is still being handled, so reading the active
 * element on open records the item and every check at that moment says it is fine; by the time the
 * dialog closes the menu is unmounted and the recorded node is detached, which sends focus to
 * `<body>` — the exact outcome the focus-return code exists to prevent. Stepping back through the
 * focus history does not help either: opening a menu moves focus from the trigger into the menu
 * content in one go and the trigger raises no `focusin`, so it is never recorded.
 *
 * The property under test is that the origin an overlay is given is somewhere focus can still go
 * after the thing that opened it has been removed. A candidate inside menu content resolves to the
 * button the menu names in `aria-labelledby`, through nested menus as well; anything else resolves
 * to itself; and when neither is usable the answer is `null` so the caller leaves Radix's own
 * default alone rather than focusing a detached node.
 *
 * Runs in process against `scripts/lib/focus-dom.ts`, which supplies the parents, attributes and
 * active element the rule reads, and nothing else. The element shapes and the focus order below
 * were taken from the running app, not invented: `role="menu"` content carrying
 * `aria-labelledby="<trigger id>"`, and focus landing on the content and then the item without the
 * trigger ever being focused.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blur, body, element, focus, type FocusElement, installFocusDom } from './lib/focus-dom.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Both overlay components carry the same focus-return wiring and must keep carrying it. */
const OVERLAY_SOURCES = [
	'frontend/src/components/ui/dialog.tsx',
	'frontend/src/components/ui/alert-dialog.tsx',
];

const failures: string[] = [];

/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * Compare an origin with a stand-in element by identity.
 *
 * `getFocusOrigin` is typed against the browser's own `HTMLElement`, which the stand-in does not
 * structurally match, so the comparison is made on the values rather than through the types.
 *
 * @param origin - What the rule returned.
 * @param expected - The element it should be, or `null`.
 * @returns Whether they are the same object.
 */
function is(origin: unknown, expected: FocusElement | null): boolean {
	return origin === expected;
}

installFocusDom();

const { getFocusOrigin, trackFocusHistory } = await import('../frontend/src/lib/focusReturn.ts');

trackFocusHistory();

/**
 * Run one scenario against a clean page.
 *
 * The module keeps its focus history for the life of the process, the same as it does for the life
 * of a page. Detaching everything afterwards is what a real navigation does to it, and it leaves
 * the next scenario with a history whose entries are all unusable rather than a fresh one.
 *
 * @param build - Builds the page and returns the origin the overlay would be given.
 * @returns Whatever the scenario read.
 */
function onAPage<T>(build: () => T): T {
	const result = build();
	for (const child of [...body.children]) child.remove();
	blur();
	return result;
}

/**
 * The row-menu shape: a button in a table cell, and menu content portalled elsewhere in the body.
 *
 * @param triggerId - The id Radix gives the trigger and repeats in the content's `aria-labelledby`.
 * @returns The trigger, the menu content, the item inside it, and the portal wrapper.
 */
function rowMenu(triggerId: string): {
	item: FocusElement;
	menu: FocusElement;
	portal: FocusElement;
	trigger: FocusElement;
} {
	const trigger = element('button', {
		'aria-label': 'Actions for workspace Default',
		id: triggerId,
	});
	body.append(element('td').append(trigger));

	const item = element('div', { role: 'menuitem' });
	const menu = element('div', { 'aria-labelledby': triggerId, role: 'menu' });
	const portal = element('div').append(menu.append(item));
	body.append(portal);

	return { item, menu, portal, trigger };
}

// The defect itself: the dialog is opened from the item, and the menu is gone when it closes.
onAPage(() => {
	const { item, menu, portal, trigger } = rowMenu('radix-r1');

	// What the browser does when the trigger is clicked. The trigger is never focused.
	focus(menu);
	focus(item);

	const origin = getFocusOrigin();
	assert(
		is(origin, trigger),
		'a dialog opened from a row menu returns focus to the row menu button',
	);
	assert(
		!is(origin, item),
		'the menu item is never handed back as the origin; it closes with the menu',
	);

	// Radix unmounts the menu as the dialog opens; the dialog closes some time after that.
	portal.remove();
	assert(
		origin?.isConnected === true,
		'the origin is still attached once the menu it was opened from has closed',
	);
});

// A submenu's trigger is itself a menu item, so one step out is not enough.
onAPage(() => {
	const { menu, trigger } = rowMenu('radix-r2');

	const subTrigger = element('div', { id: 'radix-r2-sub', role: 'menuitem' });
	menu.append(subTrigger);
	const subItem = element('div', { role: 'menuitem' });
	body.append(
		element('div').append(
			element('div', { 'aria-labelledby': 'radix-r2-sub', role: 'menu' }).append(subItem),
		),
	);

	focus(subItem);
	assert(
		is(getFocusOrigin(), trigger),
		'a dialog opened from a submenu returns focus to the button that opened the outermost menu',
	);
});

// The control that always worked, and has to keep working: a dialog opened from a plain button.
onAPage(() => {
	const button = element('button', { 'aria-label': 'Create Workspace' });
	body.append(button);
	focus(button);
	assert(is(getFocusOrigin(), button), 'a dialog opened from a plain button returns focus to it');
});

// Menu content with nothing naming its trigger has no answer, and must not invent one.
onAPage(() => {
	const item = element('div', { role: 'menuitem' });
	body.append(element('div').append(element('div', { role: 'menu' }).append(item)));
	focus(item);
	assert(
		is(getFocusOrigin(), null),
		'menu content that names no trigger yields no origin, so the overlay keeps its own default',
	);
});

// The history still does its own job: an opener that handed focus on before the overlay mounted.
onAPage(() => {
	const opener = element('button', { 'aria-label': 'Manage' });
	body.append(opener);
	focus(opener);
	blur();
	assert(
		is(getFocusOrigin(), opener),
		'an opener that lost focus before the overlay mounted is found in the history',
	);
});

// An opener that has been removed is not an answer, and neither is `<body>`.
onAPage(() => {
	const opener = element('button', { 'aria-label': 'Delete' });
	body.append(opener);
	focus(opener);
	opener.remove();
	const origin = getFocusOrigin();
	assert(
		is(origin, null),
		'a removed opener yields no origin rather than one that cannot take focus',
	);
	assert(!is(origin, body), '`<body>` is never handed back as an origin');
});

// The other half of the contract lives in the overlay components, where the origin is read on open
// and re-checked before it is focused.
for (const relativePath of OVERLAY_SOURCES) {
	const source = readFileSync(join(repoRoot, relativePath), 'utf8');
	assert(
		source.includes('returnFocusRef.current = getFocusOrigin();'),
		`${relativePath} reads the origin while the overlay opens, which is the last moment it is readable`,
	);
	assert(
		source.includes('onOpenAutoFocus={handleOpenAutoFocus}'),
		`${relativePath} reads the origin from Radix's own open hook rather than during render`,
	);
	assert(
		source.includes('if (opener?.isConnected) {'),
		`${relativePath} re-checks the origin before focusing it, so a stale one leaves the default in place`,
	);
}

if (failures.length > 0) {
	for (const failure of failures) console.error(`- ${failure}`);
	console.log(
		`[FAIL] dialog-focus-return: ${String(failures.length)} of the focus-return rules do not hold`,
	);
	process.exit(1);
}

console.log(
	'[OK] dialog-focus-return: a dialog dismissed from a row menu puts focus back on the row',
);
process.exit(0);
