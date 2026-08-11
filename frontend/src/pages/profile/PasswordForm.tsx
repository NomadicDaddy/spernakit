import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { apiClient } from '@/api/client';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { PasswordStrengthIndicator } from '@/components/shared/PasswordStrengthIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePasswordPolicy } from '@/hooks/usePasswordPolicy';
import { useBeforeUnload } from '@/hooks/useUnsavedChanges';
import { validatePasswordComplexity } from '@/lib/validation';

interface PasswordChangeData {
	currentPassword: string;
	newPassword: string;
}

interface PasswordFormProps {
	onDirtyChange: (dirty: boolean) => void;
}

export function PasswordForm({ onDirtyChange }: PasswordFormProps) {
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { requireSpecialCharacter } = usePasswordPolicy();

	function updateDirty(current: string, newPw: string, confirm: string) {
		onDirtyChange(current.length > 0 || newPw.length > 0 || confirm.length > 0);
	}

	const passwordDirty =
		currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;

	useBeforeUnload(passwordDirty);

	const passwordMutation = useMutation({
		mutationFn: (body: PasswordChangeData) =>
			apiClient.put<{ success: boolean }>('/users/me/password', { body }),
		onError: (err) =>
			toast.error(
				getSafeErrorMessage(
					err,
					'Failed to change password. Verify your current password and try again.',
				),
			),
		onSuccess: () => {
			toast.success('Password changed');
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
			onDirtyChange(false);
		},
	});

	/*
	 * Inline, under the field that is wrong, in the same `text-xs text-destructive` treatment the
	 * email form uses for the same class of problem. Both of these were toasts, so one page carried
	 * two error models: a message pinned to the offending control in one card, and a message that
	 * floated in over the corner of the screen in the next.
	 */
	const mismatchError =
		confirmPassword.length > 0 && newPassword !== confirmPassword
			? 'Passwords do not match'
			: null;
	const complexityError = newPassword
		? validatePasswordComplexity(newPassword, { requireSpecialCharacter })
		: null;

	/*
	 * Disabled until it can succeed, matching the two cards above it. This button used to render at
	 * full brightness with all three fields blank, so the page showed one "ready" primary action
	 * that was not ready beside two that correctly were not.
	 */
	const canSubmit =
		!passwordMutation.isPending &&
		currentPassword.length > 0 &&
		newPassword.length > 0 &&
		confirmPassword.length > 0 &&
		!mismatchError &&
		!complexityError;

	function handlePasswordSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		passwordMutation.mutate({ currentPassword, newPassword });
	}

	return (
		<Card>
			<CardHeader>
				{/* Sentence case, matching the cards already on this tab. */}
				<CardTitle>Change password</CardTitle>
				<CardDescription>Enter your current password and choose a new one.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handlePasswordSubmit}>
					<div className="max-w-sm space-y-2">
						<Label htmlFor="currentPassword">Current password</Label>
						<Input
							autoComplete="current-password"
							id="currentPassword"
							onChange={(e) => {
								const val = e.target.value;
								setCurrentPassword(val);
								updateDirty(val, newPassword, confirmPassword);
							}}
							required
							type="password"
							value={currentPassword}
						/>
					</div>
					<div className="max-w-sm space-y-2">
						<Label htmlFor="newPassword">New password</Label>
						<Input
							autoComplete="new-password"
							id="newPassword"
							onChange={(e) => {
								const val = e.target.value;
								setNewPassword(val);
								updateDirty(currentPassword, val, confirmPassword);
							}}
							required
							type="password"
							value={newPassword}
							{...(complexityError ? { 'aria-invalid': true } : {})}
							{...(complexityError
								? { 'aria-describedby': 'new-password-error' }
								: {})}
						/>
						<PasswordStrengthIndicator password={newPassword} />
						<div aria-live="polite">
							{complexityError ? (
								<p className="text-xs text-destructive" id="new-password-error">
									{complexityError}
								</p>
							) : null}
						</div>
					</div>
					<div className="max-w-sm space-y-2">
						<Label htmlFor="confirmPassword">Confirm new password</Label>
						<Input
							autoComplete="new-password"
							id="confirmPassword"
							onChange={(e) => {
								const val = e.target.value;
								setConfirmPassword(val);
								updateDirty(currentPassword, newPassword, val);
							}}
							required
							type="password"
							value={confirmPassword}
							{...(mismatchError ? { 'aria-invalid': true } : {})}
							{...(mismatchError
								? { 'aria-describedby': 'confirm-password-error' }
								: {})}
						/>
						<div aria-live="polite">
							{mismatchError ? (
								<p className="text-xs text-destructive" id="confirm-password-error">
									{mismatchError}
								</p>
							) : null}
						</div>
					</div>
					<Button disabled={!canSubmit} type="submit">
						{passwordMutation.isPending ? 'Changing…' : 'Change password'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
