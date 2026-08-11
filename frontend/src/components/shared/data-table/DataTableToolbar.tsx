import type { ReactNode } from 'react';

import { type Column, type Table } from '@tanstack/react-table';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

interface DataTableToolbarProps<TData> {
	/** The table's primary action, rendered at the right end of the row next to Columns. */
	actions?: ReactNode;
	children?: ReactNode;
	filterPlaceholder: string;
	searchColumn: string | undefined;
	table: Table<TData>;
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
function columnLabel<TData>(column: Column<TData>): string {
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
export function DataTableToolbar<TData>({
	actions,
	children,
	filterPlaceholder = 'Search…',
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
			<div className="ml-auto flex shrink-0 items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button aria-label="Toggle column visibility" size="sm" variant="outline">
							Columns <ChevronDown aria-hidden="true" className="ml-2 size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{table
							.getAllColumns()
							.filter((column: Column<TData>) => column.getCanHide())
							.map((column: Column<TData>) => (
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
