import { Inbox, SearchX } from 'lucide-react';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

import type { DataTableEmpty } from './types';

/**
 * The row a table shows when it has none.
 *
 * It replaces `<td class="h-24 text-center">No results.</td>` — a bare text node with no icon, no
 * action and, more importantly, no answer to the question the user actually has. "No results"
 * reads the same whether the table is empty because nothing has been created yet or because the
 * filter three controls away matches nothing, and those need opposite responses: create something,
 * or clear the filter. Four surfaces were reported for this independently, which is why it lives in
 * `DataTable` and not in any of them.
 *
 * `EmptyState`'s dashed border and tinted panel are stripped here: the table shell already draws a
 * bordered card around this cell, and the default treatment nested one box inside another.
 */
function DataTableEmptyRow({
	colSpan,
	empty,
	isFiltered,
	onClearFilters,
}: {
	colSpan: number;
	empty: DataTableEmpty | undefined;
	isFiltered: boolean;
	onClearFilters: () => void;
}) {
	// `h2` sits correctly under a PageHeader's `h1`, which is what most DataTable pages give it.
	// The settings tabs that put a SectionHeader above the table pass `h3` instead.
	const headingLevel = empty?.headingLevel ?? 'h2';

	return (
		<TableRow className="hover:bg-transparent">
			<TableCell className="p-0" colSpan={colSpan}>
				{isFiltered ? (
					<EmptyState
						action={
							<Button onClick={onClearFilters} size="sm" variant="outline">
								Clear filters
							</Button>
						}
						className="border-0 bg-transparent"
						description="No rows match the filters currently applied. Clear them to see the full list."
						headingLevel={headingLevel}
						icon={SearchX}
						title="No matching rows"
					/>
				) : (
					<EmptyState
						className="border-0 bg-transparent"
						description={empty?.description ?? 'There is nothing to show here yet.'}
						headingLevel={headingLevel}
						icon={empty?.icon ?? Inbox}
						title={empty?.title ?? 'Nothing here yet'}
						{...(empty?.action ? { action: empty.action } : {})}
					/>
				)}
			</TableCell>
		</TableRow>
	);
}

export { DataTableEmptyRow };
