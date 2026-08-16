import type { SortingState } from '@tanstack/react-table';

import { useSearchParams } from 'react-router';

/**
 * Table sort state held in the URL, for a table the server sorts.
 *
 * The URL is where this app already keeps the filters that narrow a server query, and sort belongs
 * with them for the same reasons: a sorted view stays linkable, Back steps through orderings
 * instead of losing them, and a reload does not silently reorder the rows under the reader.
 *
 * The defaults are the API's own, so an arrival with no params marks the default column's header
 * rather than claiming no order over rows that plainly have one. The API owns the sortable-column
 * allowlist and falls back rather than erroring, so a hand-edited or stale `sortBy` costs a
 * fallback ordering and nothing more — this hook deliberately does not second-guess it, or the two
 * lists would drift apart.
 *
 * @param defaultColumn - Column id the API sorts by when asked for nothing.
 * @param onReset - Run after a sort lands. A table with row selection passes its clear here:
 *   sorting returns the reader to page one of a different ordering, so a selection made before
 *   the sort survives on rows that are no longer on screen, and a bulk action would then act on
 *   rows the reader cannot see. The paging path already clears for exactly this reason.
 * @param defaultDescending - The API's default direction for that column.
 */
function useUrlSorting(defaultColumn: string, onReset?: () => void, defaultDescending = true) {
	const [searchParams, setSearchParams] = useSearchParams();

	const sortBy = searchParams.get('sortBy') ?? defaultColumn;
	const sortDir = searchParams.get('sortDir') ?? (defaultDescending ? 'desc' : 'asc');
	const sorting: SortingState = [{ desc: sortDir !== 'asc', id: sortBy }];

	/**
	 * Writes the sort and resets the page in one navigation.
	 *
	 * Dropping `page` is the load-bearing half: re-sorting from page 5 and staying on page 5 shows
	 * the fifth page of a different ordering, where every row has changed and none of them is the
	 * row that was being read. Clearing the params rather than writing the defaults back keeps the
	 * unsorted URL clean, and reads the same to the API either way.
	 */
	const onSortingChange = (next: SortingState) => {
		const [first] = next;
		setSearchParams(
			(prev) => {
				const params = new URLSearchParams(prev);
				if (first) {
					params.set('sortBy', first.id);
					params.set('sortDir', first.desc ? 'desc' : 'asc');
				} else {
					params.delete('sortBy');
					params.delete('sortDir');
				}
				params.delete('page');
				return params;
			},
			{ replace: true },
		);
		onReset?.();
	};

	return { onSortingChange, sortBy, sortDir, sorting };
}

export { useUrlSorting };
