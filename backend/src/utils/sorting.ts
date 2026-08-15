import { asc, desc, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Resolve a client-supplied sort key against an allowlist of real columns.
 *
 * A server-paginated list can only be sorted by the database — the page the client holds is 20 of
 * several hundred rows, so reordering it in the browser produces an order that is true of the page
 * and false of the record set. That makes the sort key user input, and user input naming a column
 * is the shape SQL injection takes in an ORDER BY clause. The key is therefore never interpolated:
 * it selects a Drizzle column reference from a map the caller wrote, and anything absent from that
 * map resolves to the caller's default rather than reaching the query builder at all.
 *
 * An unknown key falls back instead of erroring on purpose. The key travels in the URL, so it
 * outlives the column it names — a bookmark, a shared link or a stale tab carrying `?sortBy=email`
 * after that column is gone should show the list in its default order, not a 400.
 *
 * The tiebreaker is returned with the sort rather than left to the caller because leaving it out is
 * a paging bug, not a cosmetic one: rows sharing a value have no defined order between them, so
 * LIMIT/OFFSET over an unresolved tie can hand the reader one row twice and never show another. It
 * takes the direction of the sort it breaks — an ascending list whose ties run backwards reads as a
 * shuffle in the middle of an order.
 *
 * @param columns - Sortable columns by the key the client sends
 * @param fallback - The column to order by when the client sends nothing valid
 * @param sortBy - The client-supplied column key
 * @param sortDir - The client-supplied direction; anything but `asc` is descending
 * @param tiebreak - A unique column, normally the primary key, that resolves equal values
 * @returns The ORDER BY expressions to spread into Drizzle's `orderBy`
 */
function resolveSort(
	columns: Record<string, SQLWrapper>,
	fallback: SQLWrapper,
	sortBy: string | undefined,
	sortDir: string | undefined,
	tiebreak: SQLWrapper,
): SQL[] {
	// `Object.hasOwn`, not `in` or a truthiness check: `sortBy=constructor` would otherwise select
	// something off the prototype chain and hand a non-column to the query builder.
	const column =
		sortBy !== undefined && Object.hasOwn(columns, sortBy)
			? (columns[sortBy] ?? fallback)
			: fallback;
	const direction = sortDir === 'asc' ? asc : desc;
	return [direction(column), direction(tiebreak)];
}

export { resolveSort };
