import type { ReactNode } from 'react';

import { MoveHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
	// Booleans render as a checkbox and nulls as the word "null"; neither is text a tooltip can
	// usefully repeat, and a `title` of "false" on a checkbox is noise.
	const fullValue =
		value === null || value === undefined || typeof value === 'boolean'
			? null
			: stringifyValue(value);

	return (
		<TableCell
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
								(e.target as HTMLInputElement).value,
							);
						}
						if (e.key === 'Escape') {
							actions.onEditCancel();
						}
					}}
				/>
			) : (
				/*
				 * The width cap lives on this block, not on the `td`. A table cell in auto layout
				 * takes its width from its content, so capping the content is what caps the
				 * column; `max-width` on the cell itself is advisory and long text pushes past it.
				 * Uncapped, one `details` column on audit_logs took 668px — 45% of the visible
				 * width — and shoved four columns, the primary key among them, off-screen.
				 */
				<div
					className="max-w-[24rem] truncate"
					{...(fullValue ? { title: fullValue } : {})}>
					<CellValue value={value} />
				</div>
			)}
		</TableCell>
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
	/** The columns to render — already filtered by the toolbar's Columns menu. */
	columnNames: string[];
	editingCell: EditingCell | null;
	/** Rendered as the last band inside the card shell — the pager. */
	footer?: ReactNode;
	rows: Record<string, unknown>[];
	state: DataViewerTableState;
}

function DataViewerTable({
	actions,
	columnNames,
	editingCell,
	footer,
	rows,
	state,
}: DataViewerTableProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollCues = useCallback(() => {
		const container = scrollRef.current;
		if (!container) return;
		// Same sub-pixel threshold the section tab rail uses for the same job.
		const threshold = 2;
		setCanScrollLeft(container.scrollLeft > threshold);
		setCanScrollRight(
			container.scrollLeft + container.clientWidth < container.scrollWidth - threshold,
		);
	}, []);

	/*
	 * The observer is attached to the table rather than to the scroll container, because the thing
	 * that changes is the content: hiding a column from the Columns menu narrows the table while
	 * the container stays exactly the width it was. A callback ref re-attaches it whenever the
	 * table mounts — which includes every switch out of the loading skeleton — so there is no
	 * dependency array to keep in step with the data.
	 */
	const observeTable = useCallback(
		(table: HTMLTableElement) => {
			const observer = new ResizeObserver(updateScrollCues);
			observer.observe(table);
			const container = scrollRef.current;
			if (container) observer.observe(container);
			return () => observer.disconnect();
		},
		[updateScrollCues],
	);

	const isOverflowing = canScrollLeft || canScrollRight;

	return (
		// The shell every other table in the app wears: flush to its own rounded border, with the
		// card's vertical padding removed so the header row sits on the top edge.
		<Card className="gap-0 overflow-hidden py-0">
			<div className="relative">
				<CardContent
					className="overflow-x-auto p-0"
					onScroll={updateScrollCues}
					ref={scrollRef}>
					{state.isLoading ? (
						<div className="p-4">
							<ContentListSkeleton
								lineCount={5}
								lineHeight="h-10"
								spacing="space-y-2"
							/>
						</div>
					) : (
						/*
						 * The shadcn primitives rather than a third set of bespoke `th`/`td` classes.
						 * They carry the app's header treatment, the density-driven row padding and
						 * the hover tint that `/settings/users` has, which this grid was reproducing
						 * by hand at a shorter row height and without the hover.
						 *
						 * The bare `<table>` element stays: `Table` brings its own `overflow-x-auto`
						 * wrapper, and this panel already owns a scroll container with the ref the
						 * edge fades are computed from.
						 */
						<table className="w-full caption-bottom text-sm" ref={observeTable}>
							<TableHeader>
								<TableRow>
									{columnNames.map((col) => (
										<TableHead key={col}>{col}</TableHead>
									))}
									{state.canMutate && (
										<TableHead className="text-right">Actions</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row, i) => {
									const rowId = row.id as number;
									return (
										<TableRow key={rowId ?? i}>
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
												<TableCell className="text-right">
													<Button
														aria-label="Delete row"
														onClick={() =>
															actions.onDeleteClick(
																rowId,
																state.hasIsDeleted,
															)
														}
														size="sm"
														variant="ghost">
														<Trash2
															aria-hidden="true"
															className="h-3.5 w-3.5 text-destructive"
														/>
													</Button>
												</TableCell>
											)}
										</TableRow>
									);
								})}
								{rows.length === 0 && (
									<TableRow>
										<TableCell
											className="h-24 text-center text-muted-foreground"
											colSpan={
												columnNames.length + (state.canMutate ? 1 : 0)
											}>
											No data
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</table>
					)}
				</CardContent>

				{/*
				 * Edge fades, in the idiom the schema explorer uses for its vertical overflow. They
				 * sit outside the scroller so they stay pinned to the card edge, and they carry no
				 * pointer events so the cells beneath them stay double-clickable to edit.
				 */}
				{canScrollLeft && (
					<div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-card to-transparent" />
				)}
				{canScrollRight && (
					<div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent" />
				)}
			</div>

			{/*
			 * The fades say something is cut off; this says what to do about it. It sits below the
			 * scroller rather than floating over the last column, because an overlay that hides a
			 * column heading to announce hidden columns is its own defect.
			 */}
			{isOverflowing && (
				<p className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
					<MoveHorizontal aria-hidden="true" className="size-3.5 shrink-0" />
					Scroll sideways to reach the remaining columns, or hide the ones you do not need
					from the Columns menu.
				</p>
			)}

			{/*
			 * The pager belongs to the grid, so it lives inside the shell — the same place the shared
			 * `DataTable` puts it. Outside, the toolbar, the grid and the pager read as three
			 * unrelated strips with a card floating between them.
			 */}
			{footer}
		</Card>
	);
}

export { DataViewerTable };
export type { EditingCell };
