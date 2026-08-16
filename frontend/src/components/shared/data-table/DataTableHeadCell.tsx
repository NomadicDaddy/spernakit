import { flexRender, type Header, type RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { DataTableFeatures } from './features';
import type { StickyColumn } from './stickyColumns';

import { declaredColumnWidth } from './features';

/**
 * How a column wants its header text aligned, read from the column's own `meta`.
 *
 * Only a numeric column asks for this. Its cells are `text-right tabular-nums` so the digits line
 * up on the decimal, and a left-aligned header over right-aligned figures reads as a label for the
 * wrong column. Declared on the column rather than baked into a JSX `header` because the sort
 * control has to know it too — a button that hugs its own text cannot right-align anything.
 *
 * @param header - The header being rendered.
 * @returns `'right'` when the column asked for it, `undefined` otherwise.
 */
function readHeaderAlign<TData extends RowData>(
	header: Header<DataTableFeatures, TData, unknown>,
): 'right' | undefined {
	const meta = header.column.columnDef.meta as { headerAlign?: unknown } | undefined;
	return meta?.headerAlign === 'right' ? 'right' : undefined;
}

/**
 * One header cell: its width, its pinning, its alignment, and its sort control when it has one.
 *
 * The sort affordance belongs here rather than in each column's own `header` for the same reason
 * every other shared piece of this table does. The sorting pipeline was fully wired — sorting
 * state, `createSortedRowModel`, three registered sort functions, and `DataTable`'s docblock
 * listing "Sorting (click column headers)" as its first feature — and not one header in the
 * application rendered a control for it. Put in the shared header cell, every table gains sorting
 * at once and no table can drift from the others.
 *
 * A column opts out through `enableSorting: false`. A display column — one with no `accessorFn`,
 * which is what `actions`, `expand` and the selection checkbox are — has no value to order by and
 * is not sortable to begin with, so those keep the plain label with no flag needed.
 *
 * Naming follows the ARIA sortable-table pattern: `aria-sort` on the `th` carries the state and
 * the button is named by the column label it contains. The arrow is decorative and hidden.
 */
function DataTableHeadCell<TData extends RowData>({
	header,
	sticky,
}: {
	header: Header<DataTableFeatures, TData, unknown>;
	/** This column's pinning, or `undefined` when it is not pinned. */
	sticky: StickyColumn | undefined;
}) {
	// Only a column the author actually sized gets an inline width; the rest stay fluid and absorb
	// what is left, which is the contract `DataTableProps.columns` documents. Asking
	// `columnDef.size === undefined` answered "sized" for every column — see UNSIZED_COLUMN.
	const width = declaredColumnWidth(header.column.columnDef);
	const align = readHeaderAlign(header);
	const canSort = header.column.getCanSort();
	const sorted = header.column.getIsSorted();
	const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
	const label = header.isPlaceholder
		? null
		: flexRender(header.column.columnDef.header, header.getContext());

	return (
		<TableHead
			aria-sort={
				canSort
					? sorted === 'asc'
						? 'ascending'
						: sorted === 'desc'
							? 'descending'
							: 'none'
					: undefined
			}
			className={cn(align === 'right' && 'text-right', sticky?.headClassName)}
			data-column-id={header.column.id}
			style={{ ...(width === undefined ? undefined : { width }), ...sticky?.style }}>
			{canSort ? (
				/*
				 * The negative margin cancels the button's own `px-2` against the `th`'s, so a
				 * sortable label starts at the same x as a plain one and the header row does not
				 * step in and out depending on which columns happen to be sortable. A right-aligned
				 * column takes `w-full justify-end` instead, so its label stays over its digits.
				 *
				 * The type is restated because `Button` carries `text-sm font-medium` of its own
				 * and an unsorted header has to look exactly as it did before this control existed.
				 * Only the sorted column takes `text-foreground`, so the active one is the one that
				 * stands out.
				 */
				<Button
					className={cn(
						'h-8 px-2 text-xs font-medium tracking-wide',
						align === 'right' ? '-mr-2 w-full justify-end' : '-ml-2',
						sorted ? 'text-foreground' : 'text-muted-foreground',
					)}
					onClick={header.column.getToggleSortingHandler()}
					size="sm"
					type="button"
					variant="ghost">
					{label}
					<SortIcon
						aria-hidden="true"
						className={cn('size-3', !sorted && 'opacity-50')}
					/>
				</Button>
			) : (
				label
			)}
		</TableHead>
	);
}

export { DataTableHeadCell };
