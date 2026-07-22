import { Download, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { exportTableData } from '@/lib/tableExport';

interface DataViewerToolbarState {
	hasIsDeleted: boolean;
	includeDeleted: boolean;
	isSysop: boolean;
	safeMode: boolean;
	safeModeTogglePending: boolean;
}

interface DataViewerToolbarActions {
	onCreateClick: () => void;
	onIncludeDeletedChange: (checked: boolean) => void;
	onSafeModeToggle: (checked: boolean) => void;
}

interface DataViewerToolbarProps {
	actions: DataViewerToolbarActions;
	columnNames: string[];
	rows: Record<string, unknown>[];
	state: DataViewerToolbarState;
	tableName: string;
}

function DataViewerToolbar({
	actions,
	columnNames,
	rows,
	state,
	tableName,
}: DataViewerToolbarProps) {
	const { hasIsDeleted, includeDeleted, isSysop, safeMode, safeModeTogglePending } = state;
	const canMutate = isSysop && !safeMode;
	const { onCreateClick, onIncludeDeletedChange, onSafeModeToggle } = actions;

	function handleExport(format: 'csv' | 'json') {
		exportTableData(rows, columnNames, tableName, format);
	}

	return (
		<>
			<div className="flex flex-wrap items-center gap-3">
				<h3 className="text-sm font-semibold">{tableName}</h3>

				<Badge variant={safeMode ? 'destructive' : 'secondary'}>
					Safe Mode: {safeMode ? 'ON' : 'OFF'}
				</Badge>

				{isSysop && (
					<div className="flex items-center gap-2">
						<Switch
							aria-label="Toggle safe mode"
							checked={safeMode}
							disabled={safeModeTogglePending}
							onCheckedChange={onSafeModeToggle}
						/>
					</div>
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
					{canMutate && (
						<Button onClick={onCreateClick} size="sm">
							<Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
							Insert
						</Button>
					)}
					<Button
						disabled={rows.length === 0}
						onClick={() => handleExport('csv')}
						size="sm"
						variant="outline">
						<Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
						CSV
					</Button>
					<Button
						disabled={rows.length === 0}
						onClick={() => handleExport('json')}
						size="sm"
						variant="outline">
						<Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
						JSON
					</Button>
				</div>
			</div>

			{safeMode && isSysop && (
				<p className="text-muted-foreground text-sm">
					Safe mode is enabled. Disable safe mode to create, edit, or delete rows.
				</p>
			)}
		</>
	);
}

export { DataViewerToolbar };
