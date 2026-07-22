import { useQuery } from '@tanstack/react-query';
import { useActionState, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { getRegistrationStatus, register } from '@/api/auth';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { AuthFooterLink } from '@/components/auth/AuthFooterLink';
import { AuthFormError } from '@/components/auth/AuthFormError';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { PasswordStrengthIndicator } from '@/components/shared/PasswordStrengthIndicator';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getFormString } from '@/lib/utils';
import {
	isValidEmail,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	validatePasswordComplexity,
} from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

interface FieldErrors {
	confirmPassword?: string;
	email?: string;
	password?: string;
	username?: string;
}

type RegisterState = {
	error: null | string;
	fieldErrors: FieldErrors;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

function validateUsername(value: string): string | undefined {
	if (value.length === 0) return 'Username is required';
	if (value.length < USERNAME_MIN_LENGTH) {
		return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
	}
	if (value.length > USERNAME_MAX_LENGTH) {
		return `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
	}
	if (!USERNAME_PATTERN.test(value)) {
		return 'Only letters, numbers, underscores, dots, and hyphens are allowed';
	}
	return undefined;
}

function validateEmail(value: string): string | undefined {
	if (value.length === 0) return 'Email is required';
	if (!isValidEmail(value)) return 'Enter a valid email address';
	return undefined;
}

function validatePassword(value: string, requireSpecialCharacter: boolean): string | undefined {
	if (value.length === 0) return 'Password is required';
	return validatePasswordComplexity(value, { requireSpecialCharacter }) ?? undefined;
}

function validateConfirmPassword(password: string, confirmPassword: string): string | undefined {
	if (confirmPassword.length === 0) return 'Please confirm your password';
	if (password !== confirmPassword) return 'Passwords do not match';
	return undefined;
}

function validateRegisterForm(
	username: string,
	email: string,
	password: string,
	confirmPassword: string,
	requireSpecialCharacter: boolean
): FieldErrors {
	const errors: FieldErrors = {};
	const usernameError = validateUsername(username);
	if (usernameError) errors.username = usernameError;
	const emailError = validateEmail(email);
	if (emailError) errors.email = emailError;
	const passwordError = validatePassword(password, requireSpecialCharacter);
	if (passwordError) errors.password = passwordError;
	const confirmError = validateConfirmPassword(password, confirmPassword);
	if (confirmError) errors.confirmPassword = confirmError;
	return errors;
}

/** Self-registration page for new account creation. */
function RegisterPage() {
	const navigate = useNavigate();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const [password, setPassword] = useState('');

	const { data: registrationData, isLoading: isCheckingStatus } = useQuery({
		queryFn: getRegistrationStatus,
		queryKey: ['registration-status'],
		throwOnError: false,
	});
	const registrationEnabled = registrationData?.enabled ?? true;
	const requireSpecialCharacter = registrationData?.requireSpecialCharacter ?? true;

	const [state, submitAction, isPending] = useActionState<RegisterState, FormData>(
		async (_prevState, formData) => {
			const username = getFormString(formData, 'username');
			const email = getFormString(formData, 'email');
			const password = getFormString(formData, 'password');
			const confirmPassword = getFormString(formData, 'confirmPassword');

			const fieldErrors = validateRegisterForm(
				username,
				email,
				password,
				confirmPassword,
				requireSpecialCharacter
			);
			if (Object.keys(fieldErrors).length > 0) {
				return { error: null, fieldErrors };
			}

			try {
				await register({ confirmPassword, email, password, username });
				toast.success('Account created! Please sign in.');
				void navigate('/login');
				return { error: null, fieldErrors: {} };
			} catch (err) {
				const message = getSafeErrorMessage(err, 'Registration failed');
				return { error: message, fieldErrors: {} };
			}
		},
		{ error: null, fieldErrors: {} }
	);

	if (isAuthenticated) {
		return <Navigate replace to="/dashboard" />;
	}

	if (!isCheckingStatus && !registrationEnabled) {
		return (
			<AuthStatusMessage
				description="Self-registration is currently disabled. Please contact an administrator for account access."
				linkText="Back to sign in"
				linkTo="/login"
				title="Registration Disabled"
			/>
		);
	}

	const fieldErrors = state.fieldErrors;

	return (
		<AuthPageLayout description="Sign up for a new account" title="Create Account">
			<CardContent>
				<form action={submitAction} className="space-y-4" noValidate>
					<div className="space-y-2">
						<Label htmlFor="username">Username</Label>
						<Input
							aria-describedby={fieldErrors.username ? 'username-error' : undefined}
							autoComplete="username"
							id="username"
							maxLength={USERNAME_MAX_LENGTH}
							name="username"
							placeholder="jane.doe…"
							spellCheck={false}
							type="text"
							{...(fieldErrors.username ? { 'aria-invalid': true } : {})}
						/>
						{fieldErrors.username ? (
							<p className="text-destructive text-sm" id="username-error">
								{fieldErrors.username}
							</p>
						) : null}
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							aria-describedby={fieldErrors.email ? 'email-error' : undefined}
							autoComplete="email"
							id="email"
							name="email"
							placeholder="you@example.com…"
							spellCheck={false}
							type="email"
							{...(fieldErrors.email ? { 'aria-invalid': true } : {})}
						/>
						{fieldErrors.email ? (
							<p className="text-destructive text-sm" id="email-error">
								{fieldErrors.email}
							</p>
						) : null}
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							aria-describedby={fieldErrors.password ? 'password-error' : undefined}
							autoComplete="new-password"
							id="password"
							name="password"
							onChange={(e) => {
								setPassword(e.target.value);
							}}
							placeholder="Use 12+ characters…"
							type="password"
							value={password}
							{...(fieldErrors.password ? { 'aria-invalid': true } : {})}
						/>
						{fieldErrors.password ? (
							<p className="text-destructive text-sm" id="password-error">
								{fieldErrors.password}
							</p>
						) : null}
						<PasswordStrengthIndicator password={password} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							aria-describedby={
								fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined
							}
							autoComplete="new-password"
							id="confirmPassword"
							name="confirmPassword"
							placeholder="Retype your password…"
							type="password"
							{...(fieldErrors.confirmPassword ? { 'aria-invalid': true } : {})}
						/>
						{fieldErrors.confirmPassword ? (
							<p className="text-destructive text-sm" id="confirmPassword-error">
								{fieldErrors.confirmPassword}
							</p>
						) : null}
					</div>
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending && <Spinner className="mr-2" size={16} />}
						{isPending ? 'Creating account…' : 'Create Account'}
					</Button>
					<AuthFormError error={state.error} isPending={isPending} />
				</form>
				<AuthFooterLink label="Already have an account?" linkText="Sign in" to="/login" />
			</CardContent>
		</AuthPageLayout>
	);
}

export { RegisterPage };
