import { useState } from 'react';

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import { WorkspaceFormFields } from './WorkspaceFormFields';

interface CreateWorkspaceForm {
	description: string;
	name: string;
	slug: string;
}

interface CreateWorkspaceDialogProps {
	isOpen: boolean;
	isPending: boolean;
	onCreate: (form: CreateWorkspaceForm) => void;
	onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({
	isOpen,
	isPending,
	onCreate,
	onOpenChange,
}: CreateWorkspaceDialogProps) {
	const [form, setForm] = useState<CreateWorkspaceForm>({
		description: '',
		name: '',
		slug: '',
	});

	const handleCreate = () => {
		const slug =
			form.slug ||
			form.name
				.toLowerCase()
				.replace(/[^a-z0-9-]+/g, '-')
				.replace(/^-|-$/g, '');
		onCreate({ ...form, slug });
	};

	function handleFieldChange(field: string, value: string) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	function handleOpenChange(open: boolean) {
		if (!open) {
			setForm({ description: '', name: '', slug: '' });
		}
		onOpenChange(open);
	}

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={isOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Create Workspace</AlertDialogTitle>
					<AlertDialogDescription className="sr-only">
						Create a new workspace
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4 py-4">
					<WorkspaceFormFields
						description={form.description}
						idPrefix="workspace"
						name={form.name}
						onFieldChange={handleFieldChange}
						slug={form.slug}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel
						onClick={() => setForm({ description: '', name: '', slug: '' })}>
						Cancel
					</AlertDialogCancel>
					<Button disabled={!form.name || isPending} onClick={handleCreate}>
						{isPending ? 'Creating…' : 'Create'}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
