import { flexRender, type Row, type RowData } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { TableBody } from '@/components/ui/table';

import type { DataTableFeatures } from './features';
import type { DataTableEmpty } from './types';

import { DataTableEmptyRow } from './DataTableEmptyRow';

/**
 * Virtualized table body that renders only visible rows.
 *
 * Pinned columns (`meta.sticky`, see `stickyColumns.ts`) are deliberately not honoured here. This
 * body replaces the table rows with absolutely-positioned flex rows inside its OWN vertical
 * scroller, so `position: sticky` in it would resolve against that container and not against the
 * horizontal table scroller a pinned column has to track. A virtualized table that needs pinning
 * needs the pinning done in the virtualizer, not bolted onto these divs.
 */
function VirtualTableBody<TData extends RowData>({
	colCount,
	containerHeight,
	containerRef,
	empty,
	isFiltered,
	onClearFilters,
	overscan,
	rowHeight,
	rows,
}: {
	colCount: number;
	containerHeight: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	empty: DataTableEmpty | undefined;
	isFiltered: boolean;
	onClearFilters: () => void;
	overscan: number;
	rowHeight: number;
	rows: Row<DataTableFeatures, TData>[];
}) {
	// eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual API is not React Compiler compatible
	const virtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: () => rowHeight,
		getScrollElement: () => containerRef.current,
		overscan,
	});

	if (rows.length === 0) {
		return (
			<TableBody>
				<DataTableEmptyRow
					colSpan={colCount}
					empty={empty}
					isFiltered={isFiltered}
					onClearFilters={onClearFilters}
				/>
			</TableBody>
		);
	}

	return (
		<TableBody>
			<tr>
				<td colSpan={colCount} style={{ padding: 0 }}>
					<div
						aria-rowcount={rows.length}
						ref={containerRef}
						style={{ height: containerHeight, overflow: 'auto' }}>
						<div
							style={{
								height: virtualizer.getTotalSize(),
								position: 'relative',
								width: '100%',
							}}>
							{virtualizer.getVirtualItems().map((virtualRow) => {
								const row = rows[virtualRow.index];
								if (!row) return null;
								return (
									<div
										aria-rowindex={virtualRow.index + 1}
										className="flex items-center border-b"
										data-index={virtualRow.index}
										data-state={row.getIsSelected() ? 'selected' : undefined}
										key={row.id}
										ref={virtualizer.measureElement}
										role="row"
										style={{
											height: rowHeight,
											left: 0,
											position: 'absolute',
											top: 0,
											transform: `translateY(${virtualRow.start}px)`,
											width: '100%',
										}}>
										{row.getVisibleCells().map((cell) => (
											<div
												className="flex-1 px-4 text-sm"
												key={cell.id}
												role="cell"
												style={{
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</div>
										))}
									</div>
								);
							})}
						</div>
					</div>
				</td>
			</tr>
		</TableBody>
	);
}

export { VirtualTableBody };
