import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { DataResponse } from '@/api/types';
import type { ProfileUser } from '@/hooks/useProfile';

import { apiClient } from '@/api/client';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUsernameCheck } from '@/hooks/useProfile';
import { useBeforeUnload } from '@/hooks/useUnsavedChanges';
import { isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

import { UsernameHint } from './UsernameHint';

interface ProfileFormProps {
	onDirtyChange: (dirty: boolean) => void;
	user: ProfileUser;
}

interface EmailChangeResponse {
	pending: boolean;
}

export function ProfileForm({ onDirtyChange, user }: ProfileFormProps) {
	const queryClient = useQueryClient();
	const { roleLabel } = useAuthorization();
	const setUser = useAuthStore((s) => s.setUser);

	const [username, setUsername] = useState(user.username);
	const [profileDirty, setProfileDirty] = useState(false);

	const [newEmail, setNewEmail] = useState('');
	const [currentPassword, setCurrentPassword] = useState('');
	const [emailError, setEmailError] = useState<string | undefined>(undefined);

	useBeforeUnload(profileDirty);

	const { check, reset, status: usernameStatus } = useUsernameCheck(user.username);

	const profileMutation = useMutation({
		mutationFn: (body: { username?: string }) =>
			apiClient.put<DataResponse<ProfileUser>>('/users/me', { body }),
		onError: (err) =>
			toast.error(
				getSafeErrorMessage(
					err,
					'Failed to update profile. Please check your input and try again.'
				)
			),
		onSuccess: (result) => {
			toast.success('Profile updated');
			const existingUser = useAuthStore.getState().user;
			if (existingUser) {
				setUser({ ...existingUser, ...result.data });
			} else {
				setUser(result.data);
			}
			setProfileDirty(false);
			onDirtyChange(false);
			reset();
			void queryClient.invalidateQueries({ queryKey: ['profile'] });
		},
	});

	const emailChangeMutation = useMutation({
		mutationFn: (body: { currentPassword: string; newEmail: string }) =>
			apiClient.post<DataResponse<EmailChangeResponse>>('/users/me/email-change', { body }),
		onError: (err) =>
			toast.error(
				getSafeErrorMessage(err, 'Could not start email change. Please try again.')
			),
		onSuccess: () => {
			toast.success(
				'Confirmation link sent to the new email address. The change will take effect once you confirm.'
			);
			setNewEmail('');
			setCurrentPassword('');
			setEmailError(undefined);
		},
	});

	const canSubmitProfile =
		profileDirty &&
		!profileMutation.isPending &&
		usernameStatus !== 'taken' &&
		usernameStatus !== 'checking' &&
		usernameStatus !== 'invalid';

	const canSubmitEmailChange =
		!emailChangeMutation.isPending &&
		currentPassword.length > 0 &&
		isValidEmail(newEmail) &&
		newEmail.trim().toLowerCase() !== user.email.toLowerCase();

	function handleProfileSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (username === user.username) return;
		profileMutation.mutate({ username });
	}

	function handleEmailChangeSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!isValidEmail(newEmail)) {
			setEmailError('Enter a valid email address');
			return;
		}
		if (newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
			setEmailError('New email must differ from your current email');
			return;
		}
		emailChangeMutation.mutate({ currentPassword, newEmail: newEmail.trim() });
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Personal Information</CardTitle>
					<CardDescription>Update your username</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" noValidate onSubmit={handleProfileSubmit}>
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								autoComplete="username"
								id="username"
								onChange={(e) => {
									setUsername(e.target.value);
									setProfileDirty(true);
									onDirtyChange(true);
									check(e.target.value);
								}}
								spellCheck={false}
								value={username}
							/>
							<UsernameHint status={usernameStatus} />
						</div>
						<div className="space-y-2">
							<Label>Current email</Label>
							<p className="text-sm font-medium">{user.email}</p>
							<p className="text-muted-foreground text-xs">
								Use the &ldquo;Change email address&rdquo; section below to update
								this.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Label className="text-muted-foreground">Role</Label>
							<span className="text-sm font-medium">{roleLabel(user.role)}</span>
						</div>
						<Button disabled={!canSubmitProfile} type="submit">
							{profileMutation.isPending ? 'Saving…' : 'Save Changes'}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Change Email Address</CardTitle>
					<CardDescription>
						For your security, we&apos;ll send a confirmation link to the new address.
						Your account email won&apos;t change until you click it. A notice will also
						be sent to your current address.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" noValidate onSubmit={handleEmailChangeSubmit}>
						<div className="space-y-2">
							<Label htmlFor="new-email">New email address</Label>
							<Input
								aria-describedby={emailError ? 'new-email-error' : undefined}
								autoComplete="email"
								id="new-email"
								onChange={(e) => {
									setNewEmail(e.target.value);
									if (emailError) setEmailError(undefined);
								}}
								spellCheck={false}
								type="email"
								value={newEmail}
								{...(emailError ? { 'aria-invalid': true } : {})}
							/>
							<div aria-live="polite">
								{emailError ? (
									<p className="text-destructive text-xs" id="new-email-error">
										{emailError}
									</p>
								) : null}
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="current-password-email">Current password</Label>
							<Input
								autoComplete="current-password"
								id="current-password-email"
								onChange={(e) => setCurrentPassword(e.target.value)}
								type="password"
								value={currentPassword}
							/>
						</div>
						<Button disabled={!canSubmitEmailChange} type="submit">
							{emailChangeMutation.isPending
								? 'Sending confirmation…'
								: 'Send confirmation link'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
