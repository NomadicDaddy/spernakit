/**
 * The rows-per-page choices, in one place.
 *
 * Two controls set the same thing: the Select in every table's footer and the items-per-page
 * Select on the Preferences page. They used to carry a list each, and the lists disagreed. The
 * footer offered 10, 20, 30 and 50 while the default is 25, so on a fresh account the footer
 * Select was bound to a value none of its items carried and Radix rendered an empty box. The only
 * way to make it show anything was to pick a size the user had not asked for.
 *
 * @module pageSize
 */

/**
 * Rows per page before the signed-in user's saved preference arrives.
 *
 * Kept equal to `DEFAULT_USER_UI_SETTINGS.itemsPerPage` in
 * backend/src/services/user/userSettingsService.ts, which `test:page-size-options` checks.
 */
const DEFAULT_ITEMS_PER_PAGE = 25;

/** The sizes both controls offer. The default has to be one of them. */
const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

/**
 * The choices to offer while `current` is the size in force.
 *
 * A size can arrive from a saved preference, a URL or a server page limit, and any of those can be
 * a number that was never on the list. Adding it keeps the control able to display what it is set
 * to instead of falling back to an empty box.
 *
 * @param current - The size the control is bound to.
 * @returns The standard choices, with `current` merged in, ascending.
 */
function pageSizeOptions(current: number): number[] {
	if (!Number.isFinite(current) || current <= 0) return [...PAGE_SIZE_OPTIONS];

	const rounded = Math.trunc(current);
	if (PAGE_SIZE_OPTIONS.includes(rounded)) return [...PAGE_SIZE_OPTIONS];

	return [...PAGE_SIZE_OPTIONS, rounded].sort((a, b) => a - b);
}

export { DEFAULT_ITEMS_PER_PAGE, PAGE_SIZE_OPTIONS, pageSizeOptions };
