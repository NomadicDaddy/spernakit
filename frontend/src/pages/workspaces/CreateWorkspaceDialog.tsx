import { useRef, useState } from 'react';

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
import { useFreshOnOpen } from '@/hooks/useFreshOnOpen';

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

	/*
	 * Opening is the only moment this form is cleared. It used to be cleared from the Dialog's
	 * `onOpenChange`, which Radix calls only for a close the dialog itself asked for. The parent
	 * closes it on success by clearing its dialog state instead, so a workspace that was created
	 * successfully left its name, slug and description sitting in the fields for the next one.
	 */
	useFreshOnOpen(isOpen, () => {
		setForm({ description: '', name: '', slug: '' });
		setNameError(null);
	});

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

	return (
		/*
		 * `Dialog`, not `AlertDialog`. This is a form, and the exemplar /settings/users reserves
		 * AlertDialog for confirmations (delete, bulk delete, impersonate) while every one of its
		 * forms — create, edit, reset password, bulk role — is a Dialog. Two consequences were
		 * visible here: alert-dialog.tsx renders no corner close control, so Cancel and Escape were
		 * the only exits; and on open `document.activeElement` was the Cancel button, so a keyboard
		 * user landed on the dismiss control of a form they had opened to fill in. DialogContent
		 * renders its close after `children`, which puts first focus on the name field instead.
		 */
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Workspace</DialogTitle>
					{/*
					 * Visible, not `sr-only`. The three dialogs on this surface disagreed about
					 * their header: the members dialog rendered its description while create and
					 * edit hid theirs, so two of the three had a one-line header and one had two
					 * at otherwise identical padding. CreateUserDialog is the reference and shows
					 * its sentence.
					 */}
					<DialogDescription>Set up a new workspace.</DialogDescription>
				</DialogHeader>
				{/* No `py-4`: DialogContent's grid already supplies the 16px seam. */}
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
				<DialogFooter>
					<DialogClose asChild>
						{/* No reset here. Clearing the form belongs to the open path, which is
						    the one place that runs however the dialog was closed. */}
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button disabled={isPending} onClick={handleCreate}>
						{isPending ? 'Creating…' : 'Create'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
