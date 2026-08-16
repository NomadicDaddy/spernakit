import type { ReactNode } from 'react';

import { type ColumnDef, type RowData } from '@tanstack/react-table';

import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table';

import type { DataTableFeatures } from './features';
import type {
	DataTableEmpty as DataTableEmptyType,
	DataTablePagination as DataTablePaginationType,
	DataTableVirtualize,
} from './types';

import { DataTableEmptyRow } from './DataTableEmptyRow';
import { DataTableHeadCell } from './DataTableHeadCell';
import { DataTablePagination } from './DataTablePagination';
import { DataTableRows } from './DataTableRows';
import { DataTableToolbar } from './DataTableToolbar';
import { resolveStickyColumns } from './stickyColumns';
import { useDataTableConfig } from './useDataTableConfig';
import { useStickyColumnWidths } from './useStickyColumnWidths';
import { VirtualTableBody } from './VirtualTableBody';

/**
 * Props for the DataTable component.
 *
 * @template TData - The type of data for each row
 */
interface DataTableProps<TData extends RowData> {
	/**
	 * Column definitions for the table using TanStack Table column API.
	 *
	 * A column that declares `size` is rendered at that width; a column that omits it stays
	 * fluid and absorbs the remaining space. Declare `size` on the narrow, fixed-content
	 * columns (status, role, actions, expand toggles) and leave the content columns alone —
	 * declaring a size on every column just reproduces the even split it is meant to fix.
	 */
	columns: ColumnDef<DataTableFeatures, TData>[];
	/** Array of data to display in the table */
	data: TData[];
	/**
	 * What the table says when it has no rows. Omit it and the table still renders the shared
	 * empty state with generic wording rather than a bare "No results." cell; supply it to name
	 * the records, offer the create action, and — for a server-filtered table — tell the table
	 * that a filter is what emptied it. See `DataTableEmpty`.
	 */
	empty?: DataTableEmptyType;
	/** Placeholder text for the search input (default: "Search…") */
	filterPlaceholder?: string;
	/**
	 * Callback fired when row selection changes (enables selection mode when provided).
	 *
	 * Pair this with a column set that includes `createSelectColumn()`; without that
	 * column nothing can toggle a row and the selection footer reads 0 forever.
	 */
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
	/**
	 * Detail panel for an expanded row. Return the panel for the expanded row and a falsy value
	 * for every other row; the consumer owns the "which row is open" state.
	 *
	 * The panel renders as a second `TableRow` spanning every visible column, directly beneath
	 * its parent, and the parent picks up `data-state="selected"` so the source row is visibly
	 * the one that opened it. Rendering the panel anywhere else — after the table, after the
	 * pagination bar — puts the detail an arbitrary distance from the row it describes, which is
	 * exactly what this replaced on the audit log.
	 *
	 * Not supported while `virtualize` is active: the virtual body measures a fixed row height,
	 * and a variable-height panel would desynchronise the scroll offset from the row positions.
	 */
	renderExpandedRow?: (row: TData) => ReactNode;
	/** Column ID to use for the search filter input */
	searchColumn?: string;
	/**
	 * Change this to clear the current row selection.
	 *
	 * The table owns the checkbox state, so a consumer that empties its own selected-row
	 * list after a bulk action would otherwise leave the checkboxes checked and the
	 * footer counting rows the bulk bar no longer offers to act on. Bump this in the
	 * same place the list is cleared.
	 */
	selectionResetToken?: number | string;
	/** Consumer-provided filters rendered at the left of the shared table toolbar. */
	toolbar?: ReactNode;
	/**
	 * The table's primary action, rendered at the right end of the toolbar row beside Columns.
	 *
	 * Put "Create X" here rather than in a `div` of its own above or below the table. A primary
	 * action stranded under the table reads as belonging to the pagination row, and one stacked
	 * above it costs a whole row of vertical space to say what the toolbar was already saying.
	 */
	toolbarActions?: ReactNode;
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
 * - Row selection (when `onRowSelectionChange` is provided, and the column set
 *   prepends `createSelectColumn()` from `./selectColumn` to render the checkboxes)
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
function DataTable<TData extends RowData>({
	columns,
	data,
	empty,
	filterPlaceholder = 'Search…',
	onRowSelectionChange,
	pagination,
	renderExpandedRow,
	searchColumn,
	selectionResetToken,
	toolbar,
	toolbarActions,
	virtualize,
}: DataTableProps<TData>) {
	const { currentPage, isVirtual, rows, rowSummary, table, totalPages, virtualContainerRef } =
		useDataTableConfig({
			columns,
			data,
			onRowSelectionChange,
			pagination,
			selectionResetToken,
			virtualize,
		});

	// Column visibility toggles and the optional select column both move this away
	// from columns.length, which the body span and the virtual row width depend on.
	const visibleLeafColumns = table.getVisibleLeafColumns();
	const visibleColumnCount = visibleLeafColumns.length;

	/*
	 * Resolved from the live visible columns rather than the incoming defs, so hiding a pinned
	 * column through the Columns menu removes its inset instead of leaving a gap, and from the
	 * measured header widths rather than the declared ones. Empty unless a table opts in.
	 */
	const { headerRowRef, widths } = useStickyColumnWidths(
		visibleLeafColumns.map((column) => column.id).join(','),
	);
	// Empty while virtualized: VirtualTableBody deliberately ignores pinning, so resolving it
	// anyway would pin the header cells against body cells that scroll freely underneath them.
	const stickyColumns = resolveStickyColumns(isVirtual ? [] : visibleLeafColumns, widths);

	// A server-filtered caller carries its own filter state, so its `isFiltered` is authoritative
	// where TanStack's is silent; a client-filtered one never sets it and is read from the table.
	const isFiltered = empty?.isFiltered === true || table.state.columnFilters.length > 0;
	const clearFilters = () => {
		table.resetColumnFilters();
		empty?.onClearFilters?.();
	};

	return (
		<div className="space-y-4">
			<DataTableToolbar
				actions={toolbarActions}
				filterPlaceholder={filterPlaceholder}
				rowSummary={rowSummary}
				searchColumn={searchColumn}
				table={table}>
				{toolbar}
			</DataTableToolbar>

			{/*
			 * The shell matches the card treatment every other content panel uses, and clips to
			 * its own radius: `Table` already owns the horizontal scroller, so a second
			 * `overflow-x-auto` here only nested one scroll region inside another.
			 */}
			<div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup, groupIndex, groups) => (
							<TableRow
								key={headerGroup.id}
								// The leaf row carries the pinned columns, so it is the row whose
								// cell widths the insets are measured from.
								ref={groupIndex === groups.length - 1 ? headerRowRef : undefined}>
								{headerGroup.headers.map((header) => (
									<DataTableHeadCell
										header={header}
										key={header.id}
										sticky={stickyColumns.get(header.column.id)}
									/>
								))}
							</TableRow>
						))}
					</TableHeader>
					{isVirtual && virtualize ? (
						<VirtualTableBody
							colCount={visibleColumnCount}
							containerHeight={virtualize.containerHeight ?? 400}
							containerRef={virtualContainerRef}
							empty={empty}
							isFiltered={isFiltered}
							onClearFilters={clearFilters}
							overscan={virtualize.overscan ?? 5}
							rowHeight={virtualize.rowHeight ?? 35}
							rows={rows}
						/>
					) : (
						<TableBody>
							{rows.length ? (
								<DataTableRows
									colSpan={visibleColumnCount}
									renderExpandedRow={renderExpandedRow}
									rows={rows}
									stickyColumns={stickyColumns}
								/>
							) : (
								<DataTableEmptyRow
									colSpan={visibleColumnCount}
									empty={empty}
									isFiltered={isFiltered}
									onClearFilters={clearFilters}
								/>
							)}
						</TableBody>
					)}
				</Table>

				{/*
				 * The pager belongs to the table, so it lives inside the shell as a bordered footer
				 * band. Outside it, the row count and the page controls floated on bare page
				 * background as a third left/right-split row with nothing tying them to the rows
				 * they describe.
				 */}
				{!isVirtual && (
					<DataTablePagination
						currentPage={currentPage}
						pagination={pagination}
						table={table}
						totalPages={totalPages}
					/>
				)}
			</div>
		</div>
	);
}

export { DataTable };
export type { DataTableProps };
