import {
	type ColumnDef,
	type ColumnFiltersState,
	type ColumnVisibilityState,
	type RowData,
	type RowSelectionState,
	type SortingState,
	useTable,
} from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';

import { useLayoutStore } from '@/stores/layoutStore';

import type { DataTablePagination, DataTableVirtualize } from './types';

import { dataTableFeatures, type DataTableFeatures, UNSIZED_COLUMN } from './features';

interface UseDataTableConfigOptions<TData extends RowData> {
	columns: ColumnDef<DataTableFeatures, TData>[];
	data: TData[];
	onRowSelectionChange?: ((selectedRows: TData[]) => void) | undefined;
	pagination?: DataTablePagination | undefined;
	selectionResetToken?: number | string | undefined;
	virtualize?: DataTableVirtualize | undefined;
}

/**
 * A selection key that follows the row rather than its position.
 *
 * TanStack keys row selection by row index unless told otherwise, and index is not an identity:
 * filtering `/settings/users` to `admin` after ticking `sysop` left key `0` set, so `admin` — a
 * different account — rendered checked while the bulk bar still held `sysop`. The row that was
 * ticked and the row that Delete Selected would have deleted were not the same row.
 *
 * Every entity table in this app carries a numeric `id`, so that is the identity. A row without one
 * falls back to its index, which is exactly the behaviour that was there before.
 */
function rowSelectionKey(row: unknown, index: number): string {
	if (typeof row === 'object' && row !== null && 'id' in row) {
		const { id } = row;
		if (typeof id === 'number' || typeof id === 'string') return String(id);
	}
	return String(index);
}

function useDataTableConfig<TData extends RowData>({
	columns,
	data,
	onRowSelectionChange,
	pagination,
	selectionResetToken,
	virtualize,
}: UseDataTableConfigOptions<TData>) {
	const itemsPerPage = useLayoutStore((s) => s.itemsPerPage);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	// setRowSelection is queued, so two toggles inside one tick would both read the
	// same rendered `rowSelection` and the second would report only its own row to
	// the consumer. This ref carries the pending value between them.
	const pendingRowSelection = useRef<RowSelectionState>({});
	// Every row this table has handed out a selection key for, so a selected row can still be
	// reported after a filter removes it from `data`. Without it, ticking a second row while a
	// filter hid the first would report only the second and silently drop the first from the bulk
	// action — the opposite failure to the one the bar's "not shown" count exists to disclose.
	const knownRows = useRef(new Map<string, TData>());
	const virtualContainerRef = useRef<HTMLDivElement>(null);

	function applyRowSelection(next: RowSelectionState) {
		pendingRowSelection.current = next;
		setRowSelection(next);
		if (onRowSelectionChange) {
			data.forEach((row, index) => knownRows.current.set(rowSelectionKey(row, index), row));
			onRowSelectionChange(
				Object.keys(next)
					.filter((key) => next[key])
					.map((key) => knownRows.current.get(key))
					.filter((item): item is TData => item !== undefined),
			);
		}
	}

	const isServerPagination = !!pagination;
	const isVirtual = virtualize?.enabled ?? false;
	// Both halves, not either: `sorting` alone renders headers whose clicks go nowhere, and
	// `onSortingChange` alone leaves the indicator unable to say what order the rows are in.
	const serverSorting = pagination?.sorting;
	const onServerSortingChange = pagination?.onSortingChange;
	const isServerSorting = serverSorting !== undefined && onServerSortingChange !== undefined;
	// The caller's sort wins when it owns one, so the header indicator states the order the API
	// actually applied rather than a local guess at it.
	const activeSorting = serverSorting ?? sorting;

	const table = useTable({
		columns,
		data,
		// Replaces `columnSizingFeature`'s own `size: 150` default so an unsized column is
		// distinguishable from one that declared a width. See UNSIZED_COLUMN.
		defaultColumn: { size: UNSIZED_COLUMN },
		/*
		 * Sorting is client-side by default — `createSortedRowModel` reorders the rows the table
		 * holds — so a server-paged table can only ever sort the page that is on screen. Offering
		 * the control there would put "sorted by User ascending" on a header above 20 of 179 records
		 * with the other 159 untouched, which is a worse answer than no sorting at all.
		 *
		 * The guard therefore stays for any server-paged table whose API cannot sort. What lifts it
		 * is the caller supplying `pagination.sorting` and `pagination.onSortingChange`, which is a
		 * statement that the API orders the whole record set; `manualSorting` then stops
		 * `createSortedRowModel` reordering the page a second time on top of the order it arrived
		 * in. Virtualized tables hold all their rows and sort correctly client-side, so they were
		 * never covered by the guard.
		 */
		enableSorting: !isServerPagination || isServerSorting,
		/*
		 * Server-sorted tables toggle between ascending and descending and never pass through an
		 * unsorted state, because they have no unsorted state to reach: the API orders the whole
		 * record set on every request, and asking it for no order still returns one.
		 *
		 * With removal left on, the third click cleared the sort, and `useUrlSorting` expresses
		 * "cleared" by dropping `sortBy`/`sortDir` from the URL — from which it then re-derives the
		 * API's default. On any column that was not the default that reads as "return to the default
		 * ordering", which is fine. On the default column itself the derived state is the state the
		 * click was trying to leave, so the click did nothing: `/settings/audit-logs` opens sorted by
		 * Timestamp descending, and its Timestamp header did not respond to a click, ever.
		 * `/notifications` escaped only because its Time column infers descending-first and so
		 * reached ascending before the cleared state.
		 *
		 * Client-sorted tables keep removal: their unsorted state is the real insertion order of the
		 * rows they hold, which is a state worth being able to get back to.
		 */
		enableSortingRemoval: !isServerSorting,
		features: dataTableFeatures,
		getRowId: rowSelectionKey,
		/*
		 * The signed-in user's rows-per-page preference, not TanStack's default of 10. Nothing
		 * here ever set a page size, so every client-paged table used the library default —
		 * /settings/scheduled-tasks held 13 rows, showed 10, and pushed three behind a Next
		 * click with ~450px of empty canvas below the table. Server-paged tables read the same
		 * preference through hooks/useUrlFilters.ts, so the two halves of the app agree.
		 *
		 * `initialState` is read once per mount, which is enough: the store is persisted, so it
		 * holds the right value at first paint, and a table is never mounted while the user is
		 * on the Preferences page changing it. Ignored under server pagination, where
		 * `state.pagination` below supplies the size.
		 */
		initialState: { pagination: { pageIndex: 0, pageSize: itemsPerPage } },
		manualPagination: isServerPagination || isVirtual,
		manualSorting: isServerSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: (updater) => {
			applyRowSelection(
				typeof updater === 'function' ? updater(pendingRowSelection.current) : updater,
			);
		},
		onSortingChange: (updater) => {
			const next = typeof updater === 'function' ? updater(activeSorting) : updater;
			setSorting(next);
			onServerSortingChange?.(next);
		},
		...(isServerPagination
			? {
					pageCount:
						pagination.limit > 0 ? Math.ceil(pagination.total / pagination.limit) : 0,
				}
			: {}),
		state: {
			columnFilters,
			columnVisibility,
			rowSelection,
			sorting: activeSorting,
			...(isServerPagination
				? { pagination: { pageIndex: pagination.page - 1, pageSize: pagination.limit } }
				: {}),
		},
	});

	// Selection is dropped on a page change and whenever a consumer retires it by bumping
	// selectionResetToken after a bulk action, which keeps the checkboxes and the footer count
	// from outliving the bulk bar. A page-size change stays on the same page and leaves the
	// selection alone.
	//
	// The page-change clear is a product decision now rather than a correctness one: since keys
	// follow row identity (see rowSelectionKey) a key held over from the previous page no longer
	// marks an unrelated row. It stays because the bulk bar can only account for the rows on the
	// page it was handed, so a selection spanning pages would be one it could not describe.
	//
	// This covers the table's own state only. A page that hides the table behind a
	// loading skeleton unmounts it on a page change, so it has to clear its selected-row
	// list in the same place it changes the page; see UsersTab.tsx and NotificationsPage.tsx.
	const selectionEpoch = `${String(pagination?.page)}:${String(selectionResetToken)}`;
	const previousSelectionEpoch = useRef(selectionEpoch);
	useEffect(() => {
		if (previousSelectionEpoch.current === selectionEpoch) return;
		previousSelectionEpoch.current = selectionEpoch;
		pendingRowSelection.current = {};
		knownRows.current.clear();
		setRowSelection({});
		onRowSelectionChange?.([]);
	}, [onRowSelectionChange, selectionEpoch]);

	const rows = table.getRowModel().rows;

	const totalPages = isServerPagination
		? pagination.limit > 0
			? Math.ceil(pagination.total / pagination.limit)
			: 0
		: table.getPageCount();

	const currentPage = isServerPagination ? pagination.page : table.state.pagination.pageIndex + 1;

	/*
	 * The table's size, stated once and rendered in the toolbar rather than the footer band.
	 *
	 * It used to live only in the footer, whose top sat at y=1461 on /settings/audit-logs while
	 * <main> is 1384/1144/844 tall at 2560/1920/1440 — so "of 92" was never on screen on arrival at
	 * any desktop width, and the toolbar directly above it carried 829px of nothing between the
	 * search box and the Columns button. The count is what the toolbar's dead middle is for.
	 *
	 * A virtualized table holds every row at once and hides the pager, so a range would describe a
	 * page that does not exist; it gets the total alone.
	 */
	const pageSize = isServerPagination ? pagination.limit : table.state.pagination.pageSize;
	const totalRows = isServerPagination
		? pagination.total
		: table.getFilteredRowModel().rows.length;
	const firstRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastRow = Math.min(currentPage * pageSize, totalRows);
	const rowSummary =
		totalRows === 0
			? 'No rows'
			: isVirtual
				? `${String(totalRows)} rows`
				: `Showing ${String(firstRow)}–${String(lastRow)} of ${String(totalRows)}`;

	return { currentPage, isVirtual, rows, rowSummary, table, totalPages, virtualContainerRef };
}

export { useDataTableConfig };
