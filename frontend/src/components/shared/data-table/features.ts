import {
	columnFilteringFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_arrIncludes,
	filterFn_equals,
	filterFn_includesString,
	filterFn_inDateRange,
	filterFn_inNumberRange,
	filterFn_weakEquals,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
} from '@tanstack/react-table';

/*
 * The v9 feature registry shared by every DataTable and its column definitions. A column def
 * type-checks against the features its table registers — `size` comes from column sizing,
 * `enableHiding` from column visibility, `enableSorting` from row sorting — so the registry
 * and the `DataTableFeatures` type it infers are the one vocabulary every consumer imports
 * instead of each file restating its own generics. Row-model factories ride along here too:
 * `getRowModel()` is the end of the pipeline (core -> filtered -> sorted -> paginated), with
 * the paginated stage skipped when a table passes `manualPagination` for server paging.
 *
 * `filterFns` and `sortFns` are not optional decoration. v9 stopped bundling the built-ins, so
 * a column left on the default `'auto'` resolves its function by name out of these registries:
 * an unregistered filter name resolves to `undefined` and the filtered row model drops that
 * filter outright, so the search box would store its text and never narrow a row; an
 * unregistered sort name silently falls back to `basic`, which compares raw values and orders
 * `Bob` before `alice`. Registered here are exactly the names auto-resolution can pick — by
 * value type for filtering (string, number, boolean/object, array, Date, and the unknown-value
 * fallback) and the three it samples for sorting, with `basic` left to the library's own
 * fallback. Naming any other built-in in a `filterFn`/`sortFn` column option is a type error
 * until it is added here, which is v9's opt-in bundle contract working as intended.
 */
const dataTableFeatures = tableFeatures({
	columnFilteringFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	filteredRowModel: createFilteredRowModel(),
	filterFns: {
		arrIncludes: filterFn_arrIncludes,
		equals: filterFn_equals,
		includesString: filterFn_includesString,
		inDateRange: filterFn_inDateRange,
		inNumberRange: filterFn_inNumberRange,
		weakEquals: filterFn_weakEquals,
	},
	paginatedRowModel: createPaginatedRowModel(),
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		datetime: sortFn_datetime,
		text: sortFn_text,
	},
});

type DataTableFeatures = typeof dataTableFeatures;

export { dataTableFeatures, type DataTableFeatures };
