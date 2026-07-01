import { Trash2 } from 'lucide-react';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { stringifyValue } from '@/lib/tableExport';

import { CellValue } from './CellValue';

interface EditingCell {
	column: string;
	rowId: number;
	value: unknown;
}

interface EditActions {
	onCellDoubleClick: (rowId: number, column: string, value: unknown) => void;
	onEditCancel: () => void;
	onEditCommit: (rowId: number, column: string, value: string) => void;
}

interface EditableCellProps {
	actions: EditActions;
	canMutate: boolean;
	column: string;
	editingCell: EditingCell | null;
	rowId: number;
	value: unknown;
}

function EditableCell({
	actions,
	canMutate,
	column,
	editingCell,
	rowId,
	value,
}: EditableCellProps) {
	const isEditing = editingCell?.rowId === rowId && editingCell.column === column;

	return (
		<td
			className="px-3 py-1.5 whitespace-nowrap"
			onDoubleClick={() => {
				if (canMutate && column !== 'id') {
					actions.onCellDoubleClick(rowId, column, value);
				}
			}}>
			{isEditing ? (
				<Input
					aria-label={`Edit ${column}`}
					autoComplete="off"
					autoFocus={!('ontouchstart' in window)}
					className="h-7 text-sm"
					defaultValue={stringifyValue(editingCell.value)}
					onBlur={(e) => {
						actions.onEditCommit(rowId, column, e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							actions.onEditCommit(
								rowId,
								column,
								(e.target as HTMLInputElement).value
							);
						}
						if (e.key === 'Escape') {
							actions.onEditCancel();
						}
					}}
				/>
			) : (
				<CellValue value={value} />
			)}
		</td>
	);
}

interface DataViewerTableState {
	canMutate: boolean;
	hasIsDeleted: boolean;
	isLoading: boolean;
}

interface DataViewerTableActions extends EditActions {
	onDeleteClick: (rowId: number, hasIsDeleted: boolean) => void;
}

interface DataViewerTableProps {
	actions: DataViewerTableActions;
	columnNames: string[];
	editingCell: EditingCell | null;
	rows: Record<string, unknown>[];
	state: DataViewerTableState;
}

function DataViewerTable({ actions, columnNames, editingCell, rows, state }: DataViewerTableProps) {
	return (
		<Card>
			<CardContent className="overflow-auto p-0">
				{state.isLoading ? (
					<div className="p-4">
						<ContentListSkeleton lineCount={5} lineHeight="h-10" spacing="space-y-2" />
					</div>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b">
								{columnNames.map((col) => (
									<th
										className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap"
										key={col}>
										{col}
									</th>
								))}
								{state.canMutate && (
									<th className="px-3 py-2 text-right">Actions</th>
								)}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, i) => {
								const rowId = row.id as number;
								return (
									<tr className="border-b last:border-b-0" key={rowId ?? i}>
										{columnNames.map((col) => (
											<EditableCell
												actions={actions}
												canMutate={state.canMutate}
												column={col}
												editingCell={editingCell}
												key={col}
												rowId={rowId}
												value={row[col]}
											/>
										))}
										{state.canMutate && (
											<td className="px-3 py-1.5 text-right">
												<Button
													aria-label="Delete row"
													onClick={() =>
														actions.onDeleteClick(
															rowId,
															state.hasIsDeleted
														)
													}
													size="sm"
													variant="ghost">
													<Trash2
														aria-hidden="true"
														className="text-destructive h-3.5 w-3.5"
													/>
												</Button>
											</td>
										)}
									</tr>
								);
							})}
							{rows.length === 0 && (
								<tr>
									<td
										className="text-muted-foreground py-8 text-center"
										colSpan={columnNames.length + (state.canMutate ? 1 : 0)}>
										No data
									</td>
								</tr>
							)}
						</tbody>
					</table>
				)}
			</CardContent>
		</Card>
	);
}

export { DataViewerTable };
export type { EditingCell };
