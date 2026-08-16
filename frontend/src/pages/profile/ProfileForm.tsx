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
import { useAuthStore } from '@/stores/authStore';

import { EmailChangeCard } from './EmailChangeCard';
import { DESCRIPTION_MEASURE, FIELD_MEASURE } from './profileMeasures';
import { UsernameHint } from './UsernameHint';

interface ProfileFormProps {
	onDirtyChange: (dirty: boolean) => void;
	user: ProfileUser;
}

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

	const canSubmitProfile =
		profileDirty &&
		!profileMutation.isPending &&
		usernameStatus !== 'taken' &&
		usernameStatus !== 'checking' &&
		usernameStatus !== 'invalid';

	function handleProfileSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (username === user.username) return;
		profileMutation.mutate({ username });
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
					{/*
					 * "…and the one part of it you can change here" is gone. It was written when the
					 * Email row was a dead end; the row now carries a Change control that reaches the
					 * form, so the sentence would be contradicted by the card it introduces.
					 */}
					<CardDescription className={DESCRIPTION_MEASURE}>
						Who you are signed in as.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/*
					 * Both read-only facts in one treatment. They were two adjacent rows that
					 * disagreed on orientation and on label colour — a stacked full-contrast
					 * "Current email" beside an inline muted "Role" — and both were `<label>`
					 * elements bound to no control, so they announced as labels for nothing.
					 */}
					{/*
					 * A two-column grid, not two flex rows. As flex pairs each value started
					 * wherever its own term happened to end — "sysop@example.com" at x=728 and
					 * "System Operator" at x=722 — so the page's only key/value block had a 6px
					 * ragged left edge directly above a column of perfectly aligned form labels.
					 * `dt`/`dd` are direct children here because a grid on the `dl` can only lay
					 * out what it owns; the wrapper divs it replaces were the reason the terms
					 * could not share a track.
					 */}
					<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2">
						<dt className="text-sm text-muted-foreground">Email</dt>
						<dd className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
							{user.email}
							{/*
							 * The link the row was missing. This card told the reader their email
							 * was a fact about them, and an equal-weight card 334px further down
							 * the page contradicted it with a form that changes it — nothing on
							 * screen connected the two. A `link` button rather than a second
							 * primary: the commit still lives on the form below, this only takes
							 * you there, and focusing the field rather than scrolling to the card
							 * lands the caret where the next keystroke belongs.
							 */}
							<Button
								className="h-auto p-0 text-xs"
								onClick={() => {
									document.getElementById('new-email')?.focus();
								}}
								type="button"
								variant="link">
								Change
							</Button>
						</dd>
						<dt className="text-sm text-muted-foreground">Role</dt>
						<dd className="text-sm font-medium">{roleLabel(user.role)}</dd>
					</dl>

					<form className="space-y-4" noValidate onSubmit={handleProfileSubmit}>
						<div className={`${FIELD_MEASURE} space-y-2`}>
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

			<EmailChangeCard currentEmail={user.email} />
		</div>
	);
}
