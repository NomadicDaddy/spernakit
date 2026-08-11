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

/**
 * A reading measure for card descriptions on this surface.
 *
 * With the page's width cap gone the cards run the full canvas, and muted prose laid out at 718px
 * already wrapped into ~105-character lines — the widest run of text anywhere on the page and well
 * past the ~65 characters the baseline sets for body copy. The controls below are capped to their
 * content for the same reason; the card is wide, the words inside it are not.
 */
const DESCRIPTION_MEASURE = 'max-w-prose';

export function ProfileForm({ onDirtyChange, user }: ProfileFormProps) {
	const queryClient = useQueryClient();
	const { roleLabel } = useAuthorization();
	const setUser = useAuthStore((s) => s.setUser);

	const [username, setUsername] = useState(user.username);

	/*
	 * Dirty by comparison, not by "has been touched". Typing in the field and then restoring the
	 * original value used to leave the form permanently dirty: Save Changes stayed enabled, clicking
	 * it silently did nothing because `handleProfileSubmit` early-returns when the name is unchanged,
	 * and navigating away raised the native beforeunload prompt over a form with no changes in it.
	 */
	const profileDirty = username !== user.username;

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
					'Failed to update profile. Please check your input and try again.',
				),
			),
		onSuccess: (result) => {
			toast.success('Profile updated');
			const existingUser = useAuthStore.getState().user;
			if (existingUser) {
				setUser({ ...existingUser, ...result.data });
			} else {
				setUser(result.data);
			}
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
				getSafeErrorMessage(err, 'Could not start email change. Please try again.'),
			),
		onSuccess: () => {
			toast.success(
				'Confirmation link sent to the new email address. The change will take effect once you confirm.',
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
		// The page rhythm, not a tighter one of its own. These two cards and the ones on the sibling
		// profile tabs are all 24px apart now; this stack was 16px, and the gap to whatever followed
		// it was 24px plus a rule plus 24px.
		<div className="space-y-6">
			<Card>
				<CardHeader>
					{/*
					 * "Personal Information" restated the tab label one row above it, and "Update
					 * your username" described only the first of the card's three rows.
					 */}
					<CardTitle>Account</CardTitle>
					<CardDescription className={DESCRIPTION_MEASURE}>
						Who you are signed in as, and the one part of it you can change here.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/*
					 * Both read-only facts in one treatment. They were two adjacent rows that
					 * disagreed on orientation and on label colour — a stacked full-contrast
					 * "Current email" beside an inline muted "Role" — and both were `<label>`
					 * elements bound to no control, so they announced as labels for nothing.
					 */}
					<dl className="space-y-2">
						<div className="flex items-baseline gap-2">
							<dt className="text-sm text-muted-foreground">Email</dt>
							<dd className="text-sm font-medium">{user.email}</dd>
						</div>
						<div className="flex items-baseline gap-2">
							<dt className="text-sm text-muted-foreground">Role</dt>
							<dd className="text-sm font-medium">{roleLabel(user.role)}</dd>
						</div>
					</dl>

					<form className="space-y-4" noValidate onSubmit={handleProfileSubmit}>
						<div className="max-w-xs space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								autoComplete="username"
								id="username"
								onChange={(e) => {
									const value = e.target.value;
									setUsername(value);
									onDirtyChange(value !== user.username);
									check(value);
								}}
								spellCheck={false}
								value={username}
							/>
							<UsernameHint status={usernameStatus} />
						</div>
						<Button disabled={!canSubmitProfile} type="submit">
							{profileMutation.isPending ? 'Saving…' : 'Save Changes'}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Change email address</CardTitle>
					<CardDescription className={DESCRIPTION_MEASURE}>
						We&apos;ll send a confirmation link to the new address. Your account email
						won&apos;t change until you click it.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" noValidate onSubmit={handleEmailChangeSubmit}>
						<div className="max-w-sm space-y-2">
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
									<p className="text-xs text-destructive" id="new-email-error">
										{emailError}
									</p>
								) : null}
							</div>
						</div>
						<div className="max-w-sm space-y-2">
							<Label htmlFor="current-password-email">Current password</Label>
							<Input
								autoComplete="current-password"
								id="current-password-email"
								onChange={(e) => setCurrentPassword(e.target.value)}
								type="password"
								value={currentPassword}
							/>
						</div>
						<div className="space-y-2">
							<Button disabled={!canSubmitEmailChange} type="submit">
								{emailChangeMutation.isPending
									? 'Sending confirmation…'
									: 'Send confirmation link'}
							</Button>
							{/* The third sentence of the old description — a consequence, not a
							    premise, so it belongs next to the action that causes it. */}
							<p className="text-xs text-muted-foreground">
								A notice is also sent to your current address.
							</p>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
