/**
 * One ranked row: a label, its count, and a bar behind both showing its share of the largest.
 *
 * The shape started in `DashboardStatsSection`'s Top Features list, where the row was a bare `flex
 * justify-between` that put the feature name and its count at opposite edges of a card up to
 * 1400px wide with roughly 1000px of nothing between them, and no separator, alignment or
 * proportion to tie them together. The bar is what a "top N" list is actually asking for — rank
 * plus share, readable without reading the numbers — and it gives the width something to do.
 *
 * It lives here rather than in that page section because the By Category list in
 * `UserActivitySection` is the same list of the same events counted a different way, and it had
 * the same defect: a category badge marooned from the number it belonged to at the far edge of its
 * column. Two ranked lists on one page should not be two shapes.
 */
function RankedRow({ count, label, max }: { count: number; label: string; max: number }) {
	const share = max > 0 ? Math.max((count / max) * 100, 2) : 0;

	return (
		<li className="relative overflow-hidden rounded-md">
			<div
				aria-hidden="true"
				className="absolute inset-y-0 left-0 bg-primary/10"
				style={{ width: `${String(share)}%` }}
			/>
			<div className="relative flex items-center justify-between gap-4 px-3 py-2">
				<span className="min-w-0 truncate text-sm font-medium">{label}</span>
				<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
					{/* A rank with one event read "1 events". */}
					{count} {count === 1 ? 'event' : 'events'}
				</span>
			</div>
		</li>
	);
}

export { RankedRow };
