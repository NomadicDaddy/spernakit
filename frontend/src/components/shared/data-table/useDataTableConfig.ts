import {
	type ColumnDef,
	type ColumnFiltersState,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from '@tanstack/react-table';
import { useRef, useState } from 'react';

import type { DataTablePagination, DataTableVirtualize } from './types';

interface UseDataTableConfigOptions<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowSelectionChange?: ((selectedRows: TData[]) => void) | undefined;
	pagination?: DataTablePagination | undefined;
	virtualize?: DataTableVirtualize | undefined;
}

function useDataTableConfig<TData, TValue>({
	columns,
	data,
	onRowSelectionChange,
	pagination,
	virtualize,
}: UseDataTableConfigOptions<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = useState({});
	const virtualContainerRef = useRef<HTMLDivElement>(null);

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
			setRowSelection(updater);
			if (onRowSelectionChange) {
				const next = typeof updater === 'function' ? updater(rowSelection) : updater;
				const selectedIndices = Object.keys(next).map(Number);
				onRowSelectionChange(
					selectedIndices
						.map((i) => data[i])
						.filter((item): item is TData => item !== undefined)
				);
			}
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
