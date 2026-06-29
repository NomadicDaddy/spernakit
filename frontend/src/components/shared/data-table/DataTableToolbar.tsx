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
	filterPlaceholder: string;
	searchColumn: string | undefined;
	table: Table<TData>;
}

/**
 * Toolbar component for DataTable with search and column visibility toggle.
 */
export function DataTableToolbar<TData>({
	filterPlaceholder = 'Search…',
	searchColumn,
	table,
}: DataTableToolbarProps<TData>) {
	return (
		<div className="flex items-center gap-2">
			{searchColumn && (
				<Input
					aria-label={filterPlaceholder}
					className="max-w-sm"
					onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
					placeholder={filterPlaceholder}
					value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
				/>
			)}
			<div className="ml-auto">
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
									{column.id}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
