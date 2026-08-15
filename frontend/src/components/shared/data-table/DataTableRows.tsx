import { flexRender, type Row, type RowData } from '@tanstack/react-table';
import { Fragment, type ReactNode } from 'react';

import { TableCell, TableRow } from '@/components/ui/table';

import type { DataTableFeatures } from './features';
import type { StickyColumn } from './stickyColumns';

/**
 * The paginated table's rows.
 *
 * It is a sibling for the same reason the toolbar, the pager, the virtual body and the empty row
 * are: `DataTable` composes those pieces and owns the table's state, and the one body that stayed
 * inline was the one that pushed the file past the 300-line cap. Nothing here is table state — it
 * is given the rows and the expansion renderer and draws them.
 */
function DataTableRows<TData extends RowData>({
	colSpan,
	renderExpandedRow,
	rows,
	stickyColumns,
}: {
	colSpan: number;
	renderExpandedRow: ((row: TData) => ReactNode) | undefined;
	rows: Row<DataTableFeatures, TData>[];
	/** Pinned columns keyed by column id, resolved once by `DataTable`. Empty when none opt in. */
	stickyColumns: Map<string, StickyColumn>;
}) {
	return (
		<>
			{rows.map((row) => {
				const expanded = renderExpandedRow?.(row.original);
				return (
					<Fragment key={row.id}>
						{/*
						 * An expanded row is marked selected too, so the source row is visibly the
						 * one that opened the panel beneath it.
						 */}
						<TableRow
							data-state={row.getIsSelected() || expanded ? 'selected' : undefined}>
							{row.getVisibleCells().map((cell) => {
								const sticky = stickyColumns.get(cell.column.id);
								return (
									<TableCell
										className={sticky?.cellClassName}
										key={cell.id}
										style={sticky?.style}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								);
							})}
						</TableRow>
						{expanded && (
							<TableRow>
								<TableCell className="p-0" colSpan={colSpan}>
									{expanded}
								</TableCell>
							</TableRow>
						)}
					</Fragment>
				);
			})}
		</>
	);
}

export { DataTableRows };
