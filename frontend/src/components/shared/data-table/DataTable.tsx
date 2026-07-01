import { type ColumnDef, flexRender } from '@tanstack/react-table';

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

import type { DataTablePagination as DataTablePaginationType, DataTableVirtualize } from './types';

import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';
import { useDataTableConfig } from './useDataTableConfig';
import { VirtualTableBody } from './VirtualTableBody';

/**
 * Props for the DataTable component.
 *
 * @template TData - The type of data for each row
 * @template TValue - The type of cell values
 */
interface DataTableProps<TData, TValue> {
	/** Column definitions for the table using TanStack Table column API */
	columns: ColumnDef<TData, TValue>[];
	/** Array of data to display in the table */
	data: TData[];
	/** Placeholder text for the search input (default: "Search…") */
	filterPlaceholder?: string;
	/** Callback fired when row selection changes (enables selection mode when provided) */
	onRowSelectionChange?: (selectedRows: TData[]) => void;
	/**
	 * Server-side pagination configuration.
	 *
	 * **Pagination modes:**
	 * - **Server-side (when provided)**: API handles pagination, component receives
	 *   pre-paginated data. Use for large datasets or when consistent pagination
	 *   across users is required.
	 * - **Client-side (when omitted)**: All data is loaded upfront and paginated
	 *   in the browser. Use for small datasets (<100 rows) or offline-first apps.
	 *
	 * The dual-mode design supports template reusability across different use cases.
	 */
	pagination?: DataTablePaginationType;
	/** Column ID to use for the search filter input */
	searchColumn?: string;
	/**
	 * Virtual scrolling configuration for large datasets.
	 *
	 * When enabled, all rows are rendered in a virtualized container instead of
	 * being paginated. Only visible rows plus overscan buffer are rendered to DOM.
	 * Pagination controls are hidden when virtualization is active.
	 */
	virtualize?: DataTableVirtualize;
}

/**
 * Reusable data table component built on TanStack Table with shadcn/ui styling.
 *
 * Features:
 * - Sorting (click column headers)
 * - Filtering (search input when `searchColumn` is provided)
 * - Pagination (server-side or client-side based on `pagination` prop)
 * - Row selection (when `onRowSelectionChange` is provided)
 * - Column visibility toggles
 * - Responsive horizontal scrolling
 *
 * @example Server-side pagination (recommended for large datasets)
 * ```tsx
 * <DataTable
 *   columns={columns}
 *   data={apiResponse.data}
 *   pagination={{
 *     page: currentPage,
 *     limit: pageSize,
 *     total: apiResponse.total,
 *     onPageChange: setPage,
 *     onPageSizeChange: setPageSize,
 *   }}
 * />
 * ```
 *
 * @example Client-side pagination (for small datasets)
 * ```tsx
 * <DataTable
 *   columns={columns}
 *   data={allItems}
 *   searchColumn="name"
 * />
 * ```
 */
function DataTable<TData, TValue>({
	columns,
	data,
	filterPlaceholder = 'Search…',
	onRowSelectionChange,
	pagination,
	searchColumn,
	virtualize,
}: DataTableProps<TData, TValue>) {
	const { currentPage, isVirtual, rows, table, totalPages, virtualContainerRef } =
		useDataTableConfig({
			columns,
			data,
			onRowSelectionChange,
			pagination,
			virtualize,
		});

	return (
		<div className="space-y-4">
			<DataTableToolbar
				filterPlaceholder={filterPlaceholder}
				searchColumn={searchColumn}
				table={table}
			/>

			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					{isVirtual && virtualize ? (
						<VirtualTableBody
							colCount={columns.length}
							containerHeight={virtualize.containerHeight ?? 400}
							containerRef={virtualContainerRef}
							overscan={virtualize.overscan ?? 5}
							rowHeight={virtualize.rowHeight ?? 35}
							rows={rows}
						/>
					) : (
						<TableBody>
							{rows.length ? (
								rows.map((row) => (
									<TableRow
										data-state={row.getIsSelected() ? 'selected' : undefined}
										key={row.id}>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										className="h-24 text-center"
										colSpan={columns.length}>
										No results.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					)}
				</Table>
			</div>

			{!isVirtual && (
				<DataTablePagination
					currentPage={currentPage}
					onRowSelectionChange={onRowSelectionChange}
					pagination={pagination}
					table={table}
					totalPages={totalPages}
				/>
			)}
		</div>
	);
}

export { DataTable };
export type { DataTableProps };
