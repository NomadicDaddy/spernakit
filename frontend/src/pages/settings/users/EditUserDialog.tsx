import { useState } from 'react';

import type { UserRole, User } from '@/api/types';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

import { UserFormFields } from './UserFormFields';

interface EditForm {
	email: string;
	role: '' | UserRole;
	username: string;
}

interface EditUserDialogProps {
	isOpen: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdate: (id: number, input: EditForm) => void;
	user: null | User;
}

export function EditUserDialog({
	isOpen,
	isPending,
	onOpenChange,
	onUpdate,
	user,
}: EditUserDialogProps) {
	const [form, setForm] = useState<EditForm>({
		email: '',
		role: '',
		username: '',
	});
	// Track the user id we last hydrated form state from so we re-seed the form
	// whenever the dialog is opened for a different user. Adjusting state during
	// rendering is React's recommended alternative to `useEffect(setState)` for
	// deriving state from props (avoids cascading renders that the
	// react-hooks/set-state-in-effect rule guards against).
	const [hydratedUserId, setHydratedUserId] = useState<null | number>(null);
	if (isOpen && user && user.id !== hydratedUserId) {
		setHydratedUserId(user.id);
		setForm({
			email: user.email,
			role: user.role,
			username: user.username,
		});
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!user) return;
		const input: Partial<EditForm> = {};
		if (form.username !== user.username) input.username = form.username;
		if (form.email !== user.email) input.email = form.email;
		if (form.role && form.role !== user.role) input.role = form.role;
		onUpdate(user.id, input as EditForm);
	}

	return (
		<Dialog
			onOpenChange={(open) => {
				onOpenChange(open);
				if (!open) {
					setForm({ email: '', role: '', username: '' });
					setHydratedUserId(null);
				}
			}}
			open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit User</DialogTitle>
					<DialogDescription>Update user details for {user?.username}.</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<UserFormFields
						email={form.email}
						idPrefix="edit"
						onEmailChange={(value) => setForm((f) => ({ ...f, email: value }))}
						onRoleChange={(value) => setForm((f) => ({ ...f, role: value }))}
						onUsernameChange={(value) => setForm((f) => ({ ...f, username: value }))}
						role={form.role}
						username={form.username}
					/>
					<DialogFooter>
						<Button disabled={isPending} type="submit">
							{isPending ? 'Saving…' : 'Save Changes'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
