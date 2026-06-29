import { useState } from 'react';

import type { Workspace } from '@/api/types';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
		<AlertDialog onOpenChange={onOpenChange} open={isOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Edit Workspace</AlertDialogTitle>
					<AlertDialogDescription className="sr-only">
						Edit workspace details
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4 py-4">
					<WorkspaceFormFields
						description={form.description ?? ''}
						idPrefix="edit-workspace"
						name={form.name ?? ''}
						onFieldChange={handleFieldChange}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={handleUpdate}>
						Save Changes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
