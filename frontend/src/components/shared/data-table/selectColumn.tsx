import type { ColumnDef, RowData } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';

import type { DataTableFeatures } from './features';

/**
 * Builds the row-selection column for DataTable.
 *
 * DataTable wires selection end to end, but nothing renders a control that calls
 * toggleSelected, so a table that passes `onRowSelectionChange` without this column
 * shows a permanent "0 of N row(s) selected." footer and can never reach its bulk
 * actions. Column sets prepend this when their page enables selection.
 *
 * The header cell is visually empty, so both checkboxes carry an explicit
 * accessible name.
 *
 * @example
 * ```tsx
 * const columns: ColumnDef<DataTableFeatures, User>[] = [
 *   ...(enableSelection ? [createSelectColumn<User>()] : []),
 *   { accessorKey: 'username', header: 'Username' },
 * ];
 * ```
 */
function createSelectColumn<TData extends RowData>(): ColumnDef<DataTableFeatures, TData> {
	return {
		cell: ({ row }) => (
			<Checkbox
				aria-label="Select row"
				checked={row.getIsSelected()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
			/>
		),
		enableHiding: false,
		enableSorting: false,
		header: ({ table }) => (
			<Checkbox
				aria-label="Select all"
				checked={
					table.getIsAllPageRowsSelected() ||
					(table.getIsSomePageRowsSelected() && 'indeterminate')
				}
				onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
			/>
		),
		id: 'select',
		size: 40,
	};
}

export { createSelectColumn };
