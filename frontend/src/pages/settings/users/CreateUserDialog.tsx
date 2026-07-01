import { useState } from 'react';

import type { UserRole } from '@/api/types';

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
import { usePasswordPolicy } from '@/hooks/usePasswordPolicy';
import {
	isValidEmail,
	PASSWORD_MIN_LENGTH,
	USERNAME_MIN_LENGTH,
	validatePasswordComplexity,
} from '@/lib/validation';

import { UserFormFields } from './UserFormFields';

interface CreateForm {
	email: string;
	password: string;
	role: UserRole;
	username: string;
}

interface CreateFormErrors {
	email?: string;
	password?: string;
	username?: string;
}

interface TouchedState {
	email: boolean;
	password: boolean;
	username: boolean;
}

interface CreateUserDialogProps {
	isOpen: boolean;
	isPending: boolean;
	onCreate: (form: CreateForm) => void;
	onOpenChange: (open: boolean) => void;
}

function getUsernameError(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length === 0) return 'Username is required';
	if (trimmed.length < USERNAME_MIN_LENGTH) {
		return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
	}
	return undefined;
}

function getEmailError(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length === 0) return 'Email is required';
	if (!isValidEmail(trimmed)) return 'Enter a valid email address';
	return undefined;
}

function getPasswordError(value: string, requireSpecialCharacter: boolean): string | undefined {
	return validatePasswordComplexity(value, { requireSpecialCharacter }) ?? undefined;
}

export function CreateUserDialog({
	isOpen,
	isPending,
	onCreate,
	onOpenChange,
}: CreateUserDialogProps) {
	const [form, setForm] = useState<CreateForm>({
		email: '',
		password: '',
		role: 'VIEWER',
		username: '',
	});
	const [touched, setTouched] = useState<TouchedState>({
		email: false,
		password: false,
		username: false,
	});
	const { requireSpecialCharacter } = usePasswordPolicy();

	const usernameError = getUsernameError(form.username);
	const emailError = getEmailError(form.email);
	const passwordError = getPasswordError(form.password, requireSpecialCharacter);
	const isValid = !usernameError && !emailError && !passwordError;

	const liveErrors: CreateFormErrors = {
		...(touched.username && usernameError ? { username: usernameError } : {}),
		...(touched.email && emailError ? { email: emailError } : {}),
		...(touched.password && passwordError ? { password: passwordError } : {}),
	};

	function resetDialog() {
		setForm({ email: '', password: '', role: 'VIEWER', username: '' });
		setTouched({ email: false, password: false, username: false });
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		// Mark everything touched so errors surface even on direct submit.
		setTouched({ email: true, password: true, username: true });
		if (!isValid) return;
		onCreate(form);
		resetDialog();
	}

	const passwordErrorId = 'create-password-error';
	const passwordHelperId = 'create-password-helper';
	const hasPasswordError =
		typeof liveErrors.password === 'string' && liveErrors.password.length > 0;

	return (
		<Dialog
			onOpenChange={(open) => {
				onOpenChange(open);
				if (!open) {
					resetDialog();
				}
			}}
			open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create User</DialogTitle>
					<DialogDescription>Add a new user to system.</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" noValidate onSubmit={handleSubmit}>
					<UserFormFields
						email={form.email}
						idPrefix="create"
						onEmailBlur={() => setTouched((t) => ({ ...t, email: true }))}
						onEmailChange={(value) => setForm((f) => ({ ...f, email: value }))}
						onRoleChange={(value) => setForm((f) => ({ ...f, role: value }))}
						onUsernameBlur={() => setTouched((t) => ({ ...t, username: true }))}
						onUsernameChange={(value) => setForm((f) => ({ ...f, username: value }))}
						role={form.role}
						username={form.username}
						{...(liveErrors.email ? { emailError: liveErrors.email } : {})}
						{...(liveErrors.username ? { usernameError: liveErrors.username } : {})}
					/>
					<div className="space-y-2">
						<Label htmlFor="create-password">Password</Label>
						<Input
							aria-describedby={hasPasswordError ? passwordErrorId : passwordHelperId}
							autoComplete="new-password"
							id="create-password"
							onBlur={() => setTouched((t) => ({ ...t, password: true }))}
							onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
							required
							type="password"
							value={form.password}
							{...(hasPasswordError ? { 'aria-invalid': true } : {})}
						/>
						{hasPasswordError ? (
							<p className="text-destructive text-sm" id={passwordErrorId}>
								{liveErrors.password}
							</p>
						) : (
							<p className="text-muted-foreground text-sm" id={passwordHelperId}>
								Must be at least {PASSWORD_MIN_LENGTH} characters
							</p>
						)}
					</div>
					<DialogFooter>
						<Button disabled={isPending || !isValid} type="submit">
							{isPending ? 'Creating…' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
