import type { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

import type { DataTablePagination } from './types';

interface DataTablePaginationProps<TData> {
	currentPage: number;
	onRowSelectionChange: ((selectedRows: TData[]) => void) | undefined;
	pagination: DataTablePagination | undefined;
	table: Table<TData>;
	totalPages: number;
}

/**
 * Pagination component for DataTable with page size and navigation controls.
 */
export function DataTablePagination<TData>({
	currentPage,
	onRowSelectionChange,
	pagination,
	table,
	totalPages,
}: DataTablePaginationProps<TData>) {
	const isServerPagination = !!pagination;

	return (
		<div className="flex items-center justify-between">
			<div className="text-muted-foreground text-sm">
				{onRowSelectionChange && (
					<span>
						{table.getFilteredSelectedRowModel().rows.length} of{' '}
						{table.getFilteredRowModel().rows.length} row(s) selected.
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
					value={String(
						isServerPagination ? pagination.limit : table.getState().pagination.pageSize
					)}>
					<SelectTrigger aria-label="Rows per page" className="w-[100px]">
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
				<span className="text-muted-foreground text-sm">
					Page {currentPage} of {totalPages || 1}
				</span>
				<Button
					aria-label="Go to previous page"
					disabled={
						isServerPagination ? pagination.page <= 1 : !table.getCanPreviousPage()
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
						isServerPagination ? pagination.page >= totalPages : !table.getCanNextPage()
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
			</div>
		</div>
	);
}
