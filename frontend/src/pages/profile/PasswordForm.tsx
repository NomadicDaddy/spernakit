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
					'Failed to change password. Verify your current password and try again.'
				)
			),
		onSuccess: () => {
			toast.success('Password changed');
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
			onDirtyChange(false);
		},
	});

	function handlePasswordSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (newPassword !== confirmPassword) {
			toast.error(
				'Passwords do not match. Please re-enter your new password in both fields.'
			);
			return;
		}
		const complexityError = validatePasswordComplexity(newPassword, {
			requireSpecialCharacter,
		});
		if (complexityError) {
			toast.error(complexityError, {
				description: 'Choose a password that meets all complexity requirements.',
			});
			return;
		}
		passwordMutation.mutate({ currentPassword, newPassword });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Change Password</CardTitle>
				<CardDescription>Enter your current password and choose a new one</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handlePasswordSubmit}>
					<div className="space-y-2">
						<Label htmlFor="currentPassword">Current Password</Label>
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
					<div className="space-y-2">
						<Label htmlFor="newPassword">New Password</Label>
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
						/>
						<PasswordStrengthIndicator password={newPassword} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">Confirm New Password</Label>
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
						/>
					</div>
					<Button disabled={passwordMutation.isPending} type="submit">
						{passwordMutation.isPending ? 'Changing…' : 'Change Password'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
