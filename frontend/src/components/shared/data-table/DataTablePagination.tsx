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
	pagination: DataTablePagination | undefined;
	table: ReactTable<DataTableFeatures, TData>;
	totalPages: number;
}

/**
 * Pagination component for DataTable with page size and navigation controls.
 */
export function DataTablePagination<TData extends RowData>({
	currentPage,
	pagination,
	table,
	totalPages,
}: DataTablePaginationProps<TData>) {
	const isServerPagination = !!pagination;

	const pageSize = isServerPagination ? pagination.limit : table.state.pagination.pageSize;

	/*
	 * flex-wrap below is load-bearing, not cosmetic. This row sits inside DataTable's
	 * `overflow-hidden` card, so anything it cannot fit is clipped away rather than
	 * scrolled to. Without wrapping, at 390px the row measured 392px against a 325px
	 * card and painted "Next" past the card edge: enabled, pointer-events auto, and
	 * elementFromPoint at its centre returning null. Pages 2+ were unreachable on a
	 * phone. See pages/settings/database/DataViewerPagination for the same control
	 * that never had the bug.
	 */
	return (
		<div className="flex flex-wrap items-center gap-2 gap-y-2 border-t px-4 py-2">
			{/*
			 * One cluster, not a left/right split.
			 *
			 * The band used to put the row count at the left and the page controls at the right, and
			 * on a wide screen the split was the whole problem: /settings/bugs at 2560 ended the
			 * count at x=789 and started the size Select at x=1995, 1206px apart, both of them about
			 * the same list. The count itself has moved up to the toolbar (see useDataTableConfig),
			 * where it is above the fold; what is left here is four controls that belong together, so
			 * they are laid out together. `justify-between` on the remainder would only have moved
			 * the void rather than closed it — measured at 1087px between the size Select and
			 * Previous on /settings/audit-logs before this was collapsed to a single cluster.
			 *
			 * "Page N of M" leads rather than sitting between the buttons: it is a statement about
			 * the table, and Previous/Next are the controls that change it.
			 *
			 * flex-wrap is load-bearing, not cosmetic. This row sits inside DataTable's
			 * `overflow-hidden` card, so anything it cannot fit is clipped away rather than scrolled
			 * to. Without wrapping, at 390px the row measured 392px against a 325px card and painted
			 * "Next" past the card edge: enabled, pointer-events auto, and elementFromPoint at its
			 * centre returning null. Pages 2+ were unreachable on a phone. One flat wrapping row is
			 * also what keeps that fixed — the old shape needed the outer row and the inner cluster
			 * to wrap independently, because four controls in a nested flex overflowed as a single
			 * unbreakable unit at 360px.
			 *
			 * That overflow is invisible to the obvious test. `overflow-hidden` clips but stays
			 * programmatically scrollable, so `scrollIntoView` on the Next button silently scrolled
			 * the card 40px and then `elementFromPoint` returned the button — from a scroll offset
			 * no touch, wheel or scrollbar can reach. Measure this one at scrollLeft 0.
			 */}
			{totalPages > 1 && (
				<span className="text-sm text-muted-foreground">
					Page {currentPage} of {totalPages}
				</span>
			)}
			<Select
				onValueChange={(value) => {
					if (isServerPagination) {
						pagination.onPageSizeChange(Number(value));
					} else {
						table.setPageSize(Number(value));
					}
				}}
				value={String(pageSize)}>
				{/*
				 * w-[100px] clipped the default "20 rows" to "20 row" on every table.
				 *
				 * `size="sm"` settles the footer band on one height. It was mixed —
				 * a 36px select beside 32px Previous/Next — and `sm` is the side to
				 * settle on: this band is `py-2`, so raising the buttons to 36px
				 * would grow the footer on every table in the app to fix a 4px
				 * misalignment.
				 */}
				<SelectTrigger aria-label="Rows per page" className="w-[120px]" size="sm">
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
			 * select stays regardless: hiding it too would strand a user who had just widened the
			 * page enough to make the table single-page, with no way to narrow it again.
			 */}
			{totalPages > 1 && (
				<>
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
	);
}
