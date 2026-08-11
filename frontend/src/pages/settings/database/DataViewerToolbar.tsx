import { ChevronDown, Download, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { exportTableData } from '@/lib/tableExport';

import { DataViewerTablePicker } from './DataViewerTablePicker';

interface DataViewerToolbarState {
	hasIsDeleted: boolean;
	/** Columns the operator has switched off. Every other name in `columnNames` is shown. */
	hiddenColumns: string[];
	includeDeleted: boolean;
	isSysop: boolean;
	safeMode: boolean;
	safeModeTogglePending: boolean;
}

interface DataViewerToolbarActions {
	onCreateClick: () => void;
	onIncludeDeletedChange: (checked: boolean) => void;
	onSafeModeToggle: (checked: boolean) => void;
	onSelectTable: (tableName: string) => void;
	onToggleColumn: (column: string, visible: boolean) => void;
}

interface DataViewerToolbarProps {
	actions: DataViewerToolbarActions;
	/** Every column the table has, hidden ones included — this is also what the exports write. */
	columnNames: string[];
	rows: Record<string, unknown>[];
	state: DataViewerToolbarState;
	tableName: string;
	/** Every table the operator may switch to, for the picker that replaced the static title. */
	tableNames: string[];
}

function DataViewerToolbar({
	actions,
	columnNames,
	rows,
	state,
	tableName,
	tableNames,
}: DataViewerToolbarProps) {
	const {
		hasIsDeleted,
		hiddenColumns,
		includeDeleted,
		isSysop,
		safeMode,
		safeModeTogglePending,
	} = state;
	const canMutate = isSysop && !safeMode;
	const {
		onCreateClick,
		onIncludeDeletedChange,
		onSafeModeToggle,
		onSelectTable,
		onToggleColumn,
	} = actions;
	const visibleCount = columnNames.length - hiddenColumns.length;

	function handleExport(format: 'csv' | 'json') {
		exportTableData(rows, columnNames, tableName, format);
	}

	return (
		<div className="flex flex-wrap items-center gap-3">
			{/*
			 * This slot used to hold a static `h3` naming the current table. It named what was on
			 * screen and could not change it: the only table picker lived in the panel's empty
			 * state, so choosing a table removed the control that chose it and the only way to a
			 * different table was to leave for the Schema tab and come back. The picker names the
			 * table and switches it in the same control.
			 */}
			<DataViewerTablePicker
				onSelect={onSelectTable}
				tableNames={tableNames}
				value={tableName}
			/>

			{/*
			 * Safe mode used to be stated three times in this strip — a badge, an unlabelled
			 * switch, and a sentence below — while the `Include deleted` switch 16px away
			 * carried a visible label. One labelled control now, with red kept for the state
			 * that actually warrants it. A viewer who cannot toggle still needs to know, so
			 * they get the badge instead of the switch.
			 */}
			{isSysop ? (
				<div className="flex items-center gap-2">
					<Switch
						checked={safeMode}
						disabled={safeModeTogglePending}
						id="safe-mode"
						onCheckedChange={onSafeModeToggle}
					/>
					<Label className="text-sm" htmlFor="safe-mode">
						Safe mode
					</Label>
					{!safeMode && <Badge variant="destructive">OFF</Badge>}
				</div>
			) : (
				<Badge variant={safeMode ? 'secondary' : 'destructive'}>
					Safe mode: {safeMode ? 'on' : 'off'}
				</Badge>
			)}

			{hasIsDeleted && (
				<div className="flex items-center gap-2">
					<Switch
						aria-label="Include deleted rows"
						checked={includeDeleted}
						id="include-deleted"
						onCheckedChange={onIncludeDeletedChange}
					/>
					<Label className="text-sm" htmlFor="include-deleted">
						Include deleted
					</Label>
				</div>
			)}

			<div className="ml-auto flex gap-2">
				{/*
				 * The same control the shared DataTable toolbar carries, in the same place and
				 * with the same label, because it does the same job: a table this wide is only
				 * usable if the operator can put the columns they do not need away. The last
				 * visible column cannot be switched off — an empty table is not a view.
				 */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Toggle column visibility"
							disabled={columnNames.length === 0}
							size="sm"
							variant="outline">
							Columns <ChevronDown aria-hidden="true" className="ml-2 size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
						{columnNames.map((col) => {
							const isVisible = !hiddenColumns.includes(col);
							return (
								<DropdownMenuCheckboxItem
									checked={isVisible}
									disabled={isVisible && visibleCount === 1}
									key={col}
									onCheckedChange={(checked) => onToggleColumn(col, !!checked)}>
									{col}
								</DropdownMenuCheckboxItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
				{canMutate && (
					<Button onClick={onCreateClick} size="sm">
						<Plus aria-hidden="true" className="h-4 w-4" />
						Insert
					</Button>
				)}
				<Button
					disabled={rows.length === 0}
					onClick={() => handleExport('csv')}
					size="sm"
					variant="outline">
					<Download aria-hidden="true" className="h-4 w-4" />
					CSV
				</Button>
				<Button
					disabled={rows.length === 0}
					onClick={() => handleExport('json')}
					size="sm"
					variant="outline">
					<Download aria-hidden="true" className="h-4 w-4" />
					JSON
				</Button>
			</div>
		</div>
	);
}

export { DataViewerToolbar };
