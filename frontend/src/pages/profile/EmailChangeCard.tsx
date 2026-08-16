import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { DataResponse } from '@/api/types';

import { apiClient } from '@/api/client';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidEmail } from '@/lib/validation';

import { DESCRIPTION_MEASURE, FIELD_MEASURE } from './profileMeasures';

interface EmailChangeCardProps {
	currentEmail: string;
}

interface EmailChangeResponse {
	pending: boolean;
}

/**
 * The second card on Personal Info, split out of ProfileForm.
 *
 * It shares no state with the username form above it — separate fields, separate mutation,
 * separate submit — and keeping both in one file put that file over the 300-line cap. The Email
 * row in the card above reaches this one by focusing `#new-email`, which is why the id is fixed
 * rather than generated.
 */
export function EmailChangeCard({ currentEmail }: EmailChangeCardProps) {
	const [newEmail, setNewEmail] = useState('');
	const [currentPassword, setCurrentPassword] = useState('');
	const [emailError, setEmailError] = useState<string | undefined>(undefined);

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

	const canSubmit =
		!emailChangeMutation.isPending &&
		currentPassword.length > 0 &&
		isValidEmail(newEmail) &&
		newEmail.trim().toLowerCase() !== currentEmail.toLowerCase();

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!isValidEmail(newEmail)) {
			setEmailError('Enter a valid email address');
			return;
		}
		if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) {
			setEmailError('New email must differ from your current email');
			return;
		}
		emailChangeMutation.mutate({ currentPassword, newEmail: newEmail.trim() });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Change email address</CardTitle>
				<CardDescription className={DESCRIPTION_MEASURE}>
					We&apos;ll send a confirmation link to the new address. Your account email
					won&apos;t change until you click it.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" noValidate onSubmit={handleSubmit}>
					<div className={`${FIELD_MEASURE} space-y-2`}>
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
						{/*
						 * Same reserved line box as UsernameHint, for the same reason. This one
						 * was not in the sweep finding, but it is the identical defect on the
						 * field 60px below it: the error row does not exist until validation
						 * fails, so a bad address pushes Current password and the submit button
						 * down by 16px at the moment the user is reaching for them. Fixing one
						 * of a matched pair leaves the page inconsistent with itself.
						 */}
						<div aria-live="polite" className="min-h-4">
							{emailError ? (
								<p className="text-xs text-destructive" id="new-email-error">
									{emailError}
								</p>
							) : null}
						</div>
					</div>
					<div className={`${FIELD_MEASURE} space-y-2`}>
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
						<Button disabled={!canSubmit} type="submit">
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
	);
}
