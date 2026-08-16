import { useState } from 'react';

import type { Workspace } from '@/api/types';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

import { WorkspaceFormFields } from './WorkspaceFormFields';

interface EditWorkspaceForm {
	description?: string;
	name?: string;
}

interface EditWorkspaceDialogProps {
	isOpen: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdate: (form: EditWorkspaceForm) => void;
	workspace: undefined | Workspace;
}

export function EditWorkspaceDialog({
	isOpen,
	isPending,
	onOpenChange,
	onUpdate,
	workspace,
}: EditWorkspaceDialogProps) {
	const [form, setForm] = useState<EditWorkspaceForm>({
		description: '',
		name: '',
	});

	// Reset form when workspace changes
	if (workspace && form.name !== workspace.name) {
		setForm({
			description: workspace.description ?? '',
			name: workspace.name,
		});
	}

	const handleUpdate = () => {
		onUpdate(form);
	};

	function handleFieldChange(field: string, value: string) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	return (
		/* `Dialog`, not `AlertDialog` — see the note in CreateWorkspaceDialog. */
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Workspace</DialogTitle>
					{/* Visible, and without the `py-4` that doubled the content grid's seams — see
					    the same two corrections in CreateWorkspaceDialog. */}
					<DialogDescription>
						Update this workspace&apos;s name and description.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<WorkspaceFormFields
						description={form.description ?? ''}
						idPrefix="edit-workspace"
						name={form.name ?? ''}
						onFieldChange={handleFieldChange}
					/>
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					{/*
					 * A plain Button where AlertDialogAction used to sit, and the reason this dialog
					 * wants one: Action closes on click, which is the wrong moment. `onUpdate` in
					 * WorkspaceFormDialogs closes on the update's success instead, so a save that
					 * fails leaves this form open with what the user typed still in it.
					 */}
					<Button disabled={isPending} onClick={handleUpdate}>
						Save Changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
