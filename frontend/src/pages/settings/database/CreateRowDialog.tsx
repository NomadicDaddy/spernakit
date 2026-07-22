import { useState } from 'react';

import type { ColumnInfo } from '@/api/databaseAdmin';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CreateRowDialog({
	columns,
	onClose,
	onSubmit,
	open,
	pending,
}: {
	columns: ColumnInfo[];
	onClose: () => void;
	onSubmit: (values: Record<string, unknown>) => void;
	open: boolean;
	pending: boolean;
}) {
	const [values, setValues] = useState<Record<string, string>>({});

	// Filter out auto-generated columns
	const editableColumns = columns.filter((c) => !c.isPrimaryKey && c.name !== 'id');

	function handleSubmit() {
		const cleanValues: Record<string, unknown> = {};
		for (const col of editableColumns) {
			const val = values[col.name];
			if (val !== undefined && val !== '') {
				cleanValues[col.name] = val;
			}
		}
		onSubmit(cleanValues);
		setValues({});
	}

	return (
		<Dialog
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					setValues({});
					onClose();
				}
			}}
			open={open}>
			<DialogContent className="max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Insert Row</DialogTitle>
					<DialogDescription className="sr-only">
						Add a new row to the database table
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					{editableColumns.map((col) => (
						<div key={col.name}>
							<Label className="text-sm" htmlFor={`create-row-${col.name}`}>
								{col.name}
								{col.notnull && <span className="text-destructive ml-1">*</span>}
								<span className="text-muted-foreground ml-2 text-xs">
									{col.type}
								</span>
							</Label>
							<Input
								id={`create-row-${col.name}`}
								onChange={(e) =>
									setValues((prev) => ({ ...prev, [col.name]: e.target.value }))
								}
								placeholder={col.defaultValue ?? undefined}
								value={values[col.name] ?? ''}
							/>
						</div>
					))}
				</div>
				<DialogFooter>
					<Button disabled={pending} onClick={handleSubmit}>
						{pending ? 'Inserting…' : 'Insert'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { CreateRowDialog };
