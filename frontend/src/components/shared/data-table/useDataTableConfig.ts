import {
	type ColumnDef,
	type ColumnFiltersState,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';

import type { DataTablePagination, DataTableVirtualize } from './types';

interface UseDataTableConfigOptions<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowSelectionChange?: ((selectedRows: TData[]) => void) | undefined;
	pagination?: DataTablePagination | undefined;
	selectionResetToken?: number | string | undefined;
	virtualize?: DataTableVirtualize | undefined;
}

function useDataTableConfig<TData, TValue>({
	columns,
	data,
	onRowSelectionChange,
	pagination,
	selectionResetToken,
	virtualize,
}: UseDataTableConfigOptions<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	// setRowSelection is queued, so two toggles inside one tick would both read the
	// same rendered `rowSelection` and the second would report only its own row to
	// the consumer. This ref carries the pending value between them.
	const pendingRowSelection = useRef<RowSelectionState>({});
	const virtualContainerRef = useRef<HTMLDivElement>(null);

	function applyRowSelection(next: RowSelectionState) {
		pendingRowSelection.current = next;
		setRowSelection(next);
		if (onRowSelectionChange) {
			onRowSelectionChange(
				Object.keys(next)
					.filter((key) => next[key])
					.map((key) => data[Number(key)])
					.filter((item): item is TData => item !== undefined),
			);
		}
	}

	const isServerPagination = !!pagination;
	const isVirtual = virtualize?.enabled ?? false;

	// eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API is not React Compiler compatible
	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		manualPagination: isServerPagination || isVirtual,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: (updater) => {
			applyRowSelection(
				typeof updater === 'function' ? updater(pendingRowSelection.current) : updater,
			);
		},
		onSortingChange: setSorting,
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
			sorting,
			...(isServerPagination
				? { pagination: { pageIndex: pagination.page - 1, pageSize: pagination.limit } }
				: {}),
		},
	});

	// Selection keys are row indexes. Server-side pagination swaps the underlying rows
	// on a page change, so a key held over from the previous page would mark an
	// unrelated row and let a bulk action run against it; a bulk action that already
	// succeeded retires its selection by bumping selectionResetToken, which keeps the
	// checkboxes and the footer count from outliving the bulk bar. A page-size change
	// stays on the same page and leaves the selection alone.
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
		setRowSelection({});
		onRowSelectionChange?.([]);
	}, [onRowSelectionChange, selectionEpoch]);

	const rows = table.getRowModel().rows;

	const totalPages = isServerPagination
		? pagination.limit > 0
			? Math.ceil(pagination.total / pagination.limit)
			: 0
		: table.getPageCount();

	const currentPage = isServerPagination
		? pagination.page
		: table.getState().pagination.pageIndex + 1;

	return { currentPage, isVirtual, rows, table, totalPages, virtualContainerRef };
}

export { useDataTableConfig };
