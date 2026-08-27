import type { ReactNode } from 'react';

import { type Column, type ReactTable, type RowData } from '@tanstack/react-table';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

import type { DataTableFeatures } from './features';

interface DataTableToolbarProps<TData extends RowData> {
	/** The table's primary action, rendered at the right end of the row next to Columns. */
	actions?: ReactNode;
	children?: ReactNode;
	filterPlaceholder: string;
	/** The table's size — "Showing 1–20 of 92" — rendered in the row's dead middle. */
	rowSummary?: string;
	searchColumn: string | undefined;
	table: ReactTable<DataTableFeatures, TData>;
}

/**
 * The name a column goes by in the Columns menu.
 *
 * The menu printed `column.id`, which is the accessor key — so it offered `readAt` and `createdAt`,
 * camelCase field names that appear nowhere else in the interface, next to the same table's own
 * header row saying "Time". A column's header text is the name the user already knows it by, so
 * that is what the menu uses; the humanised id is only a fallback for a column whose header is a
 * render function rather than a string.
 */
function columnLabel<TData extends RowData>(column: Column<DataTableFeatures, TData>): string {
	const { header } = column.columnDef;
	if (typeof header === 'string' && header.length > 0) return header;
	return column.id
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^./, (character) => character.toUpperCase());
}

/**
 * Toolbar component for DataTable with search and column visibility toggle.
 *
 * Two slots, and the side each one lands on is the point: `children` are the filters that narrow
 * what the table shows and sit left with the search box; `actions` is what the user came to *do*
 * and sits right, so a table's primary action is always in the same place instead of wherever the
 * page happened to leave it.
 */
export function DataTableToolbar<TData extends RowData>({
	actions,
	children,
	filterPlaceholder = 'Search…',
	rowSummary,
	searchColumn,
	table,
}: DataTableToolbarProps<TData>) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{children}
			{searchColumn && (
				<Input
					aria-label={filterPlaceholder}
					autoComplete="off"
					className="max-w-sm"
					onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
					placeholder={filterPlaceholder}
					value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
				/>
			)}
			<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
				{/*
				 * The table's size, in the gap the row already had. On /settings/audit-logs at 2560
				 * the span between the search box and the Columns button measured 829px of nothing,
				 * and the only statement of how many records the table held was in the footer band
				 * below the fold — its top at y=1461 against a 1384px-tall <main>, so it was never on
				 * screen on arrival.
				 *
				 * Inside this group rather than loose before it, because loose is not a position. A
				 * consumer whose filter region grows (AuditLogsTab's wrapper is `flex-1`) pushed the
				 * count to x=1869, hard against Columns; one whose region does not (BugsTab) left it
				 * at x=1178, hard against the filters. Same component, same row, 691px apart. Anchored
				 * to Columns it is in one place on every table, and it sits with the other control
				 * that describes the view rather than the ones that narrow the data.
				 *
				 * `min-w-0 truncate` so the count is what abbreviates when the row runs out of width —
				 * everything else in this group is a control.
				 *
				 * Abbreviating stops being useful once there is nothing left to abbreviate to. At 390px
				 * the span had 73px to render 112px of text and showed "Showing…", which is not a
				 * shorter version of the count so much as the absence of one, and a phone has no hover
				 * to recover it with. So below `sm` the group wraps and the count takes a line of its
				 * own beneath the controls, where it has the full width and does not truncate at all.
				 * From `sm` up the row is `flex-nowrap` again and the truncate above is what happens,
				 * unchanged.
				 */}
				{rowSummary && (
					<span className="order-last w-full min-w-0 truncate text-right text-sm text-muted-foreground sm:order-none sm:w-auto sm:text-left">
						{rowSummary}
					</span>
				)}
				<DropdownMenu>
					{/*
					 * Default size, not `sm`. This is the only control in the row that was 32px —
					 * the search Input, every consumer filter Select and anything passed into
					 * `actions` are all 36px — so it read as a shorter pill at the right end of an
					 * otherwise even row, on every table in the app. /settings/backup showed it
					 * worst, sitting immediately beside a default-size "Create Backup".
					 */}
					<DropdownMenuTrigger asChild>
						{/* shrink-0 so the count beside it is the only thing this group gives up width. */}
						<Button
							aria-label="Toggle column visibility"
							className="shrink-0"
							variant="outline">
							Columns <ChevronDown aria-hidden="true" className="ml-2 size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{table
							.getAllColumns()
							.filter((column) => column.getCanHide())
							.map((column) => (
								<DropdownMenuCheckboxItem
									checked={column.getIsVisible()}
									key={column.id}
									onCheckedChange={(value) => column.toggleVisibility(!!value)}>
									{columnLabel(column)}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
				{actions}
			</div>
		</div>
	);
}
