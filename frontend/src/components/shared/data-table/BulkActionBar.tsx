import { FilterX } from 'lucide-react';
import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface BulkActionBarProps {
	/** The bulk actions themselves. Rendered after the count, in the order given. */
	children: ReactNode;
	/**
	 * How many of the selected rows the current filter is hiding.
	 *
	 * Callers with server-side filtering compute this against the page they were handed; callers
	 * with client-side filtering compute it against the table's filtered row model. Zero means every
	 * selected row is on screen, which is the case the bar was silently assuming before.
	 */
	hiddenCount?: number;
	/** Clears whatever filter is hiding the selection. Omit and no escape hatch is offered. */
	onClearFilters?: () => void;
	/** Total rows selected, visible or not. */
	selectedCount: number;
}

/**
 * The sticky bar that appears under a table while rows are selected.
 *
 * Shared because the count, the hidden-selection disclosure and the sticky chrome are the parts
 * that must not drift between surfaces — the actions are the only thing a caller should be
 * deciding. Previously this markup lived inline in UsersTab, so any second table wanting a bulk bar
 * would have copied the defect below along with the layout.
 *
 * The disclosure is the point of the component. Selection deliberately survives a filter change, so
 * an operator can gather rows across several searches — but the bar reported only a total, which
 * meant that after filtering to a string matching nothing the table showed "No matching rows", the
 * pagination band read "No rows", and the bar underneath both still read "1 selected" and still
 * offered Delete Selected. That is one click from a destructive action on a row the operator cannot
 * see and may not remember choosing.
 *
 * The fix states the split rather than hiding the bar or dropping the selection. Hiding the bar
 * loses the only place the selection is visible at all; dropping it silently discards deliberate
 * cross-filter work with no notice. Naming the hidden rows and offering to clear the filter keeps
 * the selection and makes it inspectable in one click.
 */
function BulkActionBar({
	children,
	hiddenCount = 0,
	onClearFilters,
	selectedCount,
}: BulkActionBarProps) {
	if (selectedCount === 0) return null;
	const visibleCount = Math.max(0, selectedCount - hiddenCount);

	return (
		/*
		 * Below the table and sticky, so ticking a checkbox never shoves the rows it acts on out
		 * from under the pointer — inserted above the table it moved every row 64px down. `bg-card`
		 * rather than `bg-muted`, which is the exact colour a selected row computes to: bar and
		 * selection used to be one flat grey.
		 *
		 * `flex-wrap gap-y-2` because the items are 89 + 143 + 121px plus gaps against a 326px bar at
		 * 360, and unwrapped they overflowed it as one unbreakable unit — the row that appears
		 * specifically to act on a selection could not be fully reached on the viewport where the
		 * selection was made. Buttons keep their own `whitespace-nowrap`: a wrapped row is a layout,
		 * a label broken mid-word is a defect.
		 */
		<div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 gap-y-2 rounded-xl border bg-card px-4 py-2 shadow-[var(--shadow-card)]">
			<span className="text-sm text-muted-foreground">
				{/*
				 * `aria-live="polite"`, because the number changes without the region appearing or
				 * disappearing — a screen reader that announced the bar on its first row would
				 * otherwise never hear that the filter had put the selection out of reach.
				 */}
				<span aria-live="polite">
					{selectedCount} selected
					{hiddenCount > 0 && (
						/*
						 * Spelled out rather than reduced to "1 of 2". The bar's job here is to say
						 * that the actions beside it reach rows that are not on screen, and a bare
						 * ratio reads as progress rather than as a warning.
						 */
						<>
							{' · '}
							<span className="font-medium text-foreground">
								{visibleCount === 0 ? 'none shown' : `${hiddenCount} not shown`}
							</span>
						</>
					)}
				</span>
			</span>
			{hiddenCount > 0 && onClearFilters && (
				<Button onClick={onClearFilters} size="sm" variant="ghost">
					<FilterX aria-hidden="true" className="size-4" />
					Clear filters
				</Button>
			)}
			{children}
		</div>
	);
}

export { BulkActionBar };
