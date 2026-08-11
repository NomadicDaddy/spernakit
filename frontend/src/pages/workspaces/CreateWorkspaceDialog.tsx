import { useRef, useState } from 'react';

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
	const nameInputRef = useRef<HTMLInputElement>(null);
	const [form, setForm] = useState<CreateWorkspaceForm>({
		description: '',
		name: '',
		slug: '',
	});
	const [nameError, setNameError] = useState<null | string>(null);

	const handleCreate = () => {
		if (isPending) return;
		if (!form.name.trim()) {
			setNameError('Workspace name is required');
			nameInputRef.current?.focus();
			return;
		}
		setNameError(null);
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
		if (field === 'name' && value.trim()) {
			setNameError(null);
		}
	}

	function handleOpenChange(open: boolean) {
		if (!open) {
			setForm({ description: '', name: '', slug: '' });
			setNameError(null);
		}
		onOpenChange(open);
	}

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={isOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Create Workspace</AlertDialogTitle>
					{/*
					 * Visible, not `sr-only`. The three dialogs on this surface disagreed about
					 * their header: the members dialog rendered its description while create and
					 * edit hid theirs, so two of the three had a one-line header and one had two
					 * at otherwise identical padding. CreateUserDialog is the reference and shows
					 * its sentence.
					 */}
					<AlertDialogDescription>Set up a new workspace.</AlertDialogDescription>
				</AlertDialogHeader>
				{/* No `py-4`: AlertDialogContent's grid already supplies the 16px seam. */}
				<div className="space-y-4">
					<WorkspaceFormFields
						description={form.description}
						idPrefix="workspace"
						name={form.name}
						nameInputRef={nameInputRef}
						onFieldChange={handleFieldChange}
						slug={form.slug}
						{...(nameError ? { nameError } : {})}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel
						onClick={() => setForm({ description: '', name: '', slug: '' })}>
						Cancel
					</AlertDialogCancel>
					<Button disabled={isPending} onClick={handleCreate}>
						{isPending ? 'Creating…' : 'Create'}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
