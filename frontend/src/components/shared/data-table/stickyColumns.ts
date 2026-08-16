import type { CSSProperties } from 'react';

import { declaredColumnWidth } from './features';

/**
 * Pinned identity and action columns for the shared `DataTable`.
 *
 * A settings table at 390px is two to four times wider than its card, and the two columns that
 * matter most sit at opposite ends of it: the row's identity (a filename, a username, a timestamp)
 * and the row's actions. Scrolling to reach one puts the other off screen, so a reader has to hold
 * "which row am I on" in their head while they scroll — and on /settings/backup, restoring the
 * wrong backup is the cost of getting that wrong. Pinning both ends keeps the question and the
 * answer in the same frame at every scroll position.
 *
 * **Opt in per table**, through the column definition's `meta`:
 *
 * ```ts
 * { accessorKey: 'filename', header: 'Filename', meta: { sticky: 'left' }, size: 180 }
 * ```
 *
 * Do not turn this on globally. A table whose first column is only a checkbox has no identity to
 * pin, and a pinned column costs the scroller its width permanently — at 360px there is not much
 * to spend.
 *
 * The inset of each pinned column is the summed width of the pinned columns outside it, taken from
 * `useStickyColumnWidths`'s live measurements rather than from the declared `size` — see the note
 * there for why a declared size is not a rendered width. A column's `size` is used only as the
 * first-paint estimate, before the measurement lands.
 */
type StickySide = 'left' | 'right';

/**
 * The pinned cell's own background, and the reason it cannot simply be `bg-card`.
 *
 * A sticky cell paints over the scrolled content passing beneath it, so its background has to be
 * opaque. The row's states are not: `hover:bg-muted/50` and `data-[state=selected]:bg-primary/10`
 * are translucent, and a translucent cell background composited on top of a row that has already
 * painted the same translucent colour lands at roughly double the intended tint — the pinned column
 * would visibly darken relative to the rest of its own row. `color-mix(in srgb, …)` is the opaque
 * result of that same compositing, so the pinned cell matches its row exactly in all three states.
 *
 * The hairline is a `shadow`, not a `border`: a border would change the cell's box and shift the
 * column widths the offsets above are computed from.
 */
const STICKY_CELL_CLASS =
	'sticky z-10 bg-card group-hover/row:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))] group-data-[state=selected]/row:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]';

/** Header cells have no hover or selected state of their own, so they need only the opaque base. */
const STICKY_HEAD_CLASS = 'sticky z-20 bg-card';

/**
 * The hairline marking where the pinned run ends and the scrolling content begins.
 *
 * It goes on the innermost pinned column of each side only. Put on every pinned column it draws a
 * divider between two columns that are both pinned — the audit log's expand toggle and its
 * Timestamp never move relative to each other, and a rule between them claims a boundary that is
 * not there while saying nothing about the one that is.
 *
 * A `shadow`, not a `border`: a border would change the cell's box and so change the very widths
 * the insets are measured from.
 */
const STICKY_EDGE_CLASS: Record<StickySide, string> = {
	left: 'shadow-[1px_0_0_0_var(--border)]',
	right: 'shadow-[-1px_0_0_0_var(--border)]',
};

/**
 * The part of a TanStack column this module actually reads.
 *
 * Structural rather than `Column<DataTableFeatures, TData>` on purpose: the generic form makes
 * TypeScript infer `TData` as `never` at the one call site, and nothing here needs a row type —
 * an id, a `meta.sticky` flag, and a declared width are the whole input.
 */
interface StickyCapableColumn {
	columnDef: { meta?: unknown; size?: number | undefined };
	id: string;
}

function readStickySide(column: StickyCapableColumn): StickySide | undefined {
	const meta = column.columnDef.meta as { sticky?: unknown } | undefined;
	if (meta?.sticky === 'left' || meta?.sticky === 'right') return meta.sticky;
	return undefined;
}

interface StickyColumn {
	/** Class list for a body cell in this column. */
	cellClassName: string;
	/** Class list for the header cell in this column. */
	headClassName: string;
	/** `left` or `right` inset, in pixels, as an inline style. */
	style: CSSProperties;
}

/**
 * Resolve every pinned column in `columns` to the classes and inset it needs.
 *
 * Offsets accumulate outward-in on each side: the first pinned column on the left sits at `left: 0`
 * and the next one starts where it ends, and the mirror image on the right. Columns that are not
 * pinned are absent from the map, so a caller looks up by id and gets `undefined` for the ordinary
 * ones.
 *
 * @param columns - The table's visible leaf columns, in render order.
 * @param widths - Measured header-cell widths by column id, from `useStickyColumnWidths`. A column
 *   missing from the map falls back to its declared `size`, which is what the first paint uses.
 * @returns Pinned columns keyed by column id.
 */
function resolveStickyColumns(
	columns: readonly StickyCapableColumn[],
	widths: ReadonlyMap<string, number>,
): Map<string, StickyColumn> {
	const resolved = new Map<string, StickyColumn>();
	const widthOf = (column: StickyCapableColumn) =>
		widths.get(column.id) ?? declaredColumnWidth(column.columnDef) ?? 0;

	// Each side's run in outward-in order, so the last entry is the one bordering the content.
	const leftRun = columns.filter((column) => readStickySide(column) === 'left');
	const rightRun = columns.filter((column) => readStickySide(column) === 'right').reverse();

	for (const [side, run] of [
		['left', leftRun],
		['right', rightRun],
	] as const) {
		let offset = 0;
		run.forEach((column, index) => {
			const edge = index === run.length - 1 ? ` ${STICKY_EDGE_CLASS[side]}` : '';
			resolved.set(column.id, {
				cellClassName: `${STICKY_CELL_CLASS}${edge}`,
				headClassName: `${STICKY_HEAD_CLASS}${edge}`,
				style: { [side]: offset },
			});
			offset += widthOf(column);
		});
	}

	return resolved;
}

export { resolveStickyColumns };
export type { StickyColumn, StickySide };
