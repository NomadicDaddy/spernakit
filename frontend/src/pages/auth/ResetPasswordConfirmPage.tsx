import { useActionState, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { resetPassword } from '@/api/auth';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { AuthFooterLink } from '@/components/auth/AuthFooterLink';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePasswordPolicy } from '@/hooks/usePasswordPolicy';
import { getFormString } from '@/lib/utils';
import { PASSWORD_MIN_LENGTH, validatePasswordMatch } from '@/lib/validation';

type ResetConfirmState = {
	error: null | string;
	success: boolean;
};

/** Password reset confirmation page that accepts a new password via a token-validated link. */
function ResetPasswordConfirmPage() {
	const [searchParams] = useSearchParams();
	const [token] = useState(() => searchParams.get('token') ?? '');
	const { requireSpecialCharacter } = usePasswordPolicy();

	// Strip token from URL to minimize exposure in browser history and Referer headers
	useEffect(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.has('token')) {
			url.searchParams.delete('token');
			window.history.replaceState(null, '', url.pathname + url.search);
		}
	}, []);

	const [state, submitAction, isPending] = useActionState<ResetConfirmState, FormData>(
		async (_prevState, formData) => {
			const password = getFormString(formData, 'password');
			const confirmPassword = getFormString(formData, 'confirmPassword');

			const passwordError = validatePasswordMatch(password, confirmPassword, {
				requireSpecialCharacter,
			});
			if (passwordError) {
				toast.error(passwordError);
				return { error: passwordError, success: false };
			}

			try {
				await resetPassword({ confirmPassword, password, token });
				toast.success('Password reset successfully');
				return { error: null, success: true };
			} catch (err) {
				const message = getSafeErrorMessage(err, 'Reset failed');
				return { error: message, success: false };
			}
		},
		{ error: null, success: false }
	);

	if (!token) {
		return (
			<AuthStatusMessage
				description="This password reset link is invalid or has expired."
				linkText="Back to login"
				linkTo="/login"
				title="Invalid Link"
			/>
		);
	}

	if (state.success) {
		return (
			<AuthStatusMessage
				description="Your password has been reset successfully."
				linkText="Sign in with your new password"
				linkTo="/login"
				title="Password Reset"
			/>
		);
	}

	const hasError = state.error !== null && !isPending;

	return (
		<AuthPageLayout description="Enter your new password below." title="Set New Password">
			<CardContent>
				<form action={submitAction} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="password">New Password</Label>
						<Input
							aria-describedby={hasError ? 'reset-password-error' : undefined}
							autoComplete="new-password"
							id="password"
							minLength={PASSWORD_MIN_LENGTH}
							name="password"
							placeholder="Create a strong password…"
							required
							type="password"
							{...(hasError ? { 'aria-invalid': true } : {})}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm-password">Confirm Password</Label>
						<Input
							aria-describedby={hasError ? 'reset-password-error' : undefined}
							autoComplete="new-password"
							id="confirm-password"
							minLength={PASSWORD_MIN_LENGTH}
							name="confirmPassword"
							placeholder="Retype your new password…"
							required
							type="password"
							{...(hasError ? { 'aria-invalid': true } : {})}
						/>
					</div>
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending && <Spinner className="mr-2" size={16} />}
						{isPending ? 'Resetting…' : 'Reset Password'}
					</Button>
					{hasError && (
						<p
							aria-live="polite"
							className="text-destructive text-center text-sm"
							id="reset-password-error"
							role="alert">
							{state.error}
						</p>
					)}
				</form>
				<AuthFooterLink linkText="Back to login" to="/login" />
			</CardContent>
		</AuthPageLayout>
	);
}

export { ResetPasswordConfirmPage };
