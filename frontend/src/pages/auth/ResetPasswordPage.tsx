import { type FormEvent, useActionState } from 'react';

import { forgotPassword } from '@/api/auth';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { AuthFooterLink } from '@/components/auth/AuthFooterLink';
import { AuthFormError } from '@/components/auth/AuthFormError';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getFormString } from '@/lib/utils';

type ResetPasswordState = {
	error: null | string;
	submitted: boolean;
};

/** Password reset request page that sends a reset link to the user's email. */
function ResetPasswordPage() {
	const [state, submitAction, isPending] = useActionState<ResetPasswordState, FormData>(
		async (_prevState, formData) => {
			const email = getFormString(formData, 'email');

			try {
				await forgotPassword(email);
				return { error: null, submitted: true };
			} catch (err) {
				const message = getSafeErrorMessage(err, 'Request failed');
				return { error: message, submitted: false };
			}
		},
		{ error: null, submitted: false }
	);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		if (event.currentTarget.checkValidity()) return;

		event.preventDefault();
		event.currentTarget.reportValidity();
	};

	if (state.submitted) {
		return (
			<AuthStatusMessage
				description="If an account exists with that email, a password reset link has been sent."
				linkText="Back to login"
				linkTo="/login"
				title="Check Your Email"
			/>
		);
	}

	return (
		<AuthPageLayout
			description="Enter your email address and we will send you a reset link."
			title="Reset Password">
			<CardContent>
				<form action={submitAction} className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							autoComplete="email"
							id="email"
							name="email"
							placeholder="you@example.com…"
							required
							spellCheck={false}
							type="email"
						/>
					</div>
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending && <Spinner className="mr-2" size={16} />}
						{isPending ? 'Sending…' : 'Send Reset Link'}
					</Button>
					<AuthFormError error={state.error} isPending={isPending} />
				</form>
				<AuthFooterLink linkText="Back to login" to="/login" />
			</CardContent>
		</AuthPageLayout>
	);
}

export { ResetPasswordPage };
