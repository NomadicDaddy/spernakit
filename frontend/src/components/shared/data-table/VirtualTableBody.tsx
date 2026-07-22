import { type Row, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { TableBody, TableCell, TableRow } from '@/components/ui/table';

/**
 * Virtualized table body that renders only visible rows.
 */
function VirtualTableBody<TData>({
	colCount,
	containerHeight,
	containerRef,
	overscan,
	rowHeight,
	rows,
}: {
	colCount: number;
	containerHeight: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	overscan: number;
	rowHeight: number;
	rows: Row<TData>[];
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
				<TableRow>
					<TableCell className="h-24 text-center" colSpan={colCount}>
						No results.
					</TableCell>
				</TableRow>
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
													cell.getContext()
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
