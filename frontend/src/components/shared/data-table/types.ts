import type { SortingState } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a DataTable says when it has no rows.
 *
 * Every field is optional and the table has a usable default for each, so a caller that wants the
 * shared empty state gets it by passing `{}`. Supply `title`/`description`/`icon` to name the
 * thing the table is empty *of*, and `action` to offer the same "Create X" the toolbar carries —
 * an empty table is where that action is most wanted and hardest to find.
 *
 * The *filtered* empty state is not configurable, because it is the same sentence everywhere and
 * the table can write it itself. What the table cannot know is whether a caller filtering
 * server-side has a filter applied: TanStack's own filter state is empty on those tables, so
 * `/settings/users` and `/settings/bugs` would report "nothing here yet" while a search box three
 * controls away held a string. `isFiltered` is how those callers say otherwise, and
 * `onClearFilters` is how the Clear button reaches state the table does not own.
 */
interface DataTableEmpty {
	/** Primary action for the genuinely-empty case, usually the toolbar's own create button. */
	action?: ReactNode;
	description?: ReactNode;
	/**
	 * Outline level for the empty state's title. Defaults to `h2`, which is correct directly under
	 * a `PageHeader` — most DataTable pages have no `SectionHeader` at all. Pass `h3` where one
	 * does sit above the table, so the empty state reads as part of that section rather than as a
	 * sibling of it. The default errs toward `h2` because repeating a level is merely redundant,
	 * while skipping one breaks the outline (WCAG H42).
	 */
	headingLevel?: 'h2' | 'h3' | 'h4';
	icon?: LucideIcon;
	/** True when the caller's own filters are narrowing a server-side query. */
	isFiltered?: boolean;
	/** Clears the caller's own filters; the table always resets its internal ones too. */
	onClearFilters?: () => void;
	title?: string;
}

/**
 * Server-side pagination configuration for DataTable.
 *
 * When provided, the DataTable operates in server-side pagination mode where
 * the API is responsible for paginating data. The component receives pre-paginated
 * data and uses these callbacks to request different pages.
 */
interface DataTablePagination {
	limit: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	/**
	 * Sort state changed. Supply this together with `sorting` to declare that the API sorts, which
	 * is what re-enables the header controls on a server-paginated table.
	 *
	 * Reset the page to 1 in here. Sorting page 5 of 9 and staying on page 5 shows the fifth page of
	 * a different ordering — every row on screen changes and none of them is the row that was being
	 * looked at, which reads as data loss rather than as a reorder.
	 */
	onSortingChange?: (sorting: SortingState) => void;
	page: number;
	/**
	 * The sort the API applied, owned by the caller.
	 *
	 * Sorting is client-side by default — `createSortedRowModel` reorders the rows the table holds,
	 * which on a server-paged table is one page of several hundred rows. A header offering that
	 * would claim "sorted by User ascending" over 20 of 179 records with the other 159 untouched, so
	 * a server-paginated table that does not supply this pair keeps its sort controls hidden. Supply
	 * it and the headers come back, ordering the whole record set rather than the visible page.
	 */
	sorting?: SortingState;
	total: number;
}

/**
 * Virtual scrolling configuration for DataTable.
 *
 * When enabled, replaces standard pagination with virtualized row rendering
 * for efficient display of large datasets (500+ rows).
 */
interface DataTableVirtualize {
	/** Height of the scrollable container in pixels (default: 400) */
	containerHeight?: number;
	/** Enable virtual scrolling */
	enabled: boolean;
	/** Number of rows rendered outside the visible area (default: 5) */
	overscan?: number;
	/** Fixed row height in pixels (default: 35) */
	rowHeight?: number;
}

export type { DataTableEmpty, DataTablePagination, DataTableVirtualize };
