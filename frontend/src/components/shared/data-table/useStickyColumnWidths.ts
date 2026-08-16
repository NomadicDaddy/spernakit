import { useLayoutEffect, useRef, useState } from 'react';

const EMPTY: ReadonlyMap<string, number> = new Map();

/**
 * The rendered width of each header cell, keyed by column id.
 *
 * Pinned columns sit at an inset equal to the summed widths of the pinned columns outside them, and
 * a column's declared `size` is not that width. Under `table-layout: auto` the declared size is a
 * preference the browser overrides whenever the cell's content will not fit: the audit log's expand
 * toggle declares `size: 40` and renders at 52, because a 36px icon button in a cell with 8px of
 * padding cannot be narrower. Offsets built from the declared numbers put the next pinned column
 * 12px too far left, where its opaque background covers the edge of the very control it was pinned
 * to keep reachable.
 *
 * So the widths are measured rather than assumed. A `ResizeObserver` on the header row and each of
 * its cells catches the three things that move them — the viewport resizing, a column being hidden
 * from the Columns menu, and content arriving on the first data render.
 *
 * @param signature - The visible column ids, joined. Changing it re-attaches the observer to the
 *   cells that exist now; without it, hiding a column would leave the observer watching a detached
 *   node and the remaining insets frozen at their pre-hide values.
 * @returns The header row ref to attach, and the measured widths (empty until the first measure).
 */
function useStickyColumnWidths(signature: string) {
	const headerRowRef = useRef<HTMLTableRowElement>(null);
	const [widths, setWidths] = useState<ReadonlyMap<string, number>>(EMPTY);

	// Layout, not effect: this measures layout and then feeds the result back into layout. Run
	// after paint and the first frame draws every pinned column at its declared-size estimate and
	// the corrected one lands visibly a frame later.
	useLayoutEffect(() => {
		const row = headerRowRef.current;
		if (!row) return;

		const cells = () => row.querySelectorAll<HTMLElement>('[data-column-id]');
		const read = () => {
			const next = new Map<string, number>();
			for (const cell of cells()) {
				const id = cell.dataset.columnId;
				if (id) next.set(id, cell.getBoundingClientRect().width);
			}
			// Bail on an unchanged measurement: the observer fires on every layout pass, and a new
			// Map identity each time would re-render the whole table body for nothing.
			setWidths((prev) => {
				if (prev.size === next.size && [...next].every(([id, w]) => prev.get(id) === w)) {
					return prev;
				}
				return next;
			});
		};

		read();
		const observer = new ResizeObserver(read);
		observer.observe(row);
		for (const cell of cells()) observer.observe(cell);
		return () => {
			observer.disconnect();
		};
	}, [signature]);

	return { headerRowRef, widths };
}

export { useStickyColumnWidths };
