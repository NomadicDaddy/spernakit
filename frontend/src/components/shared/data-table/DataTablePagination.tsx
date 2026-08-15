import type { ReactTable, RowData } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

import type { DataTableFeatures } from './features';
import type { DataTablePagination } from './types';

interface DataTablePaginationProps<TData extends RowData> {
	currentPage: number;
	onRowSelectionChange: ((selectedRows: TData[]) => void) | undefined;
	pagination: DataTablePagination | undefined;
	table: ReactTable<DataTableFeatures, TData>;
	totalPages: number;
}

/**
 * Pagination component for DataTable with page size and navigation controls.
 */
export function DataTablePagination<TData extends RowData>({
	currentPage,
	onRowSelectionChange,
	pagination,
	table,
	totalPages,
}: DataTablePaginationProps<TData>) {
	const isServerPagination = !!pagination;

	const pageSize = isServerPagination ? pagination.limit : table.state.pagination.pageSize;
	const totalRows = isServerPagination
		? pagination.total
		: table.getFilteredRowModel().rows.length;
	const firstRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastRow = Math.min(currentPage * pageSize, totalRows);

	return (
		<div className="flex items-center justify-between border-t px-4 py-2">
			{/*
			 * The left slot used to be filled only in selection mode, so every table without
			 * checkboxes rendered an empty div and never stated its own size. Selection count
			 * takes precedence when it applies; otherwise the table says how many rows there are.
			 */}
			<div className="text-sm text-muted-foreground">
				{onRowSelectionChange ? (
					<span>
						{table.getFilteredSelectedRowModel().rows.length} of{' '}
						{table.getFilteredRowModel().rows.length} row(s) selected.
					</span>
				) : (
					<span>
						{totalRows === 0
							? 'No rows'
							: `Showing ${String(firstRow)}–${String(lastRow)} of ${String(totalRows)}`}
					</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Select
					onValueChange={(value) => {
						if (isServerPagination) {
							pagination.onPageSizeChange(Number(value));
						} else {
							table.setPageSize(Number(value));
						}
					}}
					value={String(pageSize)}>
					{/* w-[100px] clipped the default "20 rows" to "20 row" on every table. */}
					<SelectTrigger aria-label="Rows per page" className="w-[120px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{[10, 20, 30, 50].map((size) => (
							<SelectItem key={size} value={String(size)}>
								{size} rows
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{/*
				 * On a single-page table the indicator reads "Page 1 of 1" and both buttons sit
				 * permanently disabled — full visual weight for three inert controls. The page-size
				 * select stays regardless: hiding it too would strand a user who had just widened
				 * the page enough to make the table single-page, with no way to narrow it again.
				 */}
				{totalPages > 1 && (
					<>
						<span className="text-sm text-muted-foreground">
							Page {currentPage} of {totalPages}
						</span>
						<Button
							aria-label="Go to previous page"
							disabled={
								isServerPagination
									? pagination.page <= 1
									: !table.getCanPreviousPage()
							}
							onClick={() => {
								if (isServerPagination) {
									pagination.onPageChange(pagination.page - 1);
								} else {
									table.previousPage();
								}
							}}
							size="sm"
							variant="outline">
							Previous
						</Button>
						<Button
							aria-label="Go to next page"
							disabled={
								isServerPagination
									? pagination.page >= totalPages
									: !table.getCanNextPage()
							}
							onClick={() => {
								if (isServerPagination) {
									pagination.onPageChange(pagination.page + 1);
								} else {
									table.nextPage();
								}
							}}
							size="sm"
							variant="outline">
							Next
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
