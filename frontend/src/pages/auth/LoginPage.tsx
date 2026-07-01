import { useQuery } from '@tanstack/react-query';
import { useActionState, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { DataResponse } from '@/api/types';

import { getRegistrationStatus } from '@/api/auth';
import { apiClient } from '@/api/client';
import { getDemoAccounts } from '@/api/demo';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { AuthFooterLink } from '@/components/auth/AuthFooterLink';
import { AuthFormError } from '@/components/auth/AuthFormError';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { DemoAccountButtons } from '@/components/auth/DemoAccountButtons';
import { OAuthProviderButtons, type OAuthProvider } from '@/components/auth/OAuthProviderButtons';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { getFormString } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

type LoginState = {
	error: null | string;
};

/** Login page with username/password form and optional OAuth provider buttons. */
function LoginPage() {
	const navigate = useNavigate();
	const { login } = useAuth();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const formRef = useRef<HTMLFormElement>(null);
	const usernameRef = useRef<HTMLInputElement>(null);
	const passwordRef = useRef<HTMLInputElement>(null);
	const [demoSelected, setDemoSelected] = useState(false);

	const { data: oauthData } = useQuery({
		queryFn: () =>
			apiClient.get<DataResponse<{ providers: OAuthProvider[] }>>('/auth/oauth/providers'),
		queryKey: ['oauth-providers'],
		throwOnError: false,
	});

	const { data: registrationData } = useQuery({
		queryFn: getRegistrationStatus,
		queryKey: ['registration-status'],
		throwOnError: false,
	});
	const registrationEnabled = registrationData?.enabled ?? true;

	const handleDemoSelect = () => {
		setDemoSelected(true);
	};

	const isDev = !!import.meta.env.DEV;

	const { data: demoData } = useQuery({
		enabled: isDev,
		queryFn: getDemoAccounts,
		queryKey: ['demo-accounts'],
		retry: false,
		throwOnError: false,
	});

	const providers = oauthData?.data?.providers ?? [];
	const demoAccounts = demoData?.accounts ?? [];

	const [state, submitAction, isPending] = useActionState<LoginState, FormData>(
		async (_prevState, formData) => {
			setDemoSelected(false);
			const username = getFormString(formData, 'username');
			const password = getFormString(formData, 'password');

			try {
				const result = await login({ password, username });
				if (result.kind === 'mfa') {
					void navigate('/mfa-verify', { state: { mfaToken: result.mfaToken } });
				} else {
					void navigate('/dashboard');
				}
				return { error: null };
			} catch (err) {
				const message = getSafeErrorMessage(err, 'Login failed');
				toast.error(message);
				return { error: message };
			}
		},
		{ error: null }
	);

	if (isAuthenticated) {
		return <Navigate replace to="/dashboard" />;
	}

	return (
		<AuthPageLayout
			description="Sign in to your account"
			title={<span translate="no">{__APP_NAME__}</span>}>
			<CardContent>
				<form action={submitAction} className="space-y-4" ref={formRef}>
					<div className="space-y-2">
						<Label htmlFor="username">Username</Label>
						<Input
							autoComplete="username"
							id="username"
							name="username"
							placeholder="you@example.com or jane.doe…"
							ref={usernameRef}
							required
							spellCheck={false}
							type="text"
						/>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="password">Password</Label>
							<Link
								className="text-primary text-sm hover:underline"
								to="/forgot-password">
								Forgot password?
							</Link>
						</div>
						<Input
							autoComplete="current-password"
							id="password"
							name="password"
							placeholder="Enter your password…"
							ref={passwordRef}
							required
							type="password"
						/>
					</div>
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending && <Spinner className="mr-2" />}
						{isPending ? 'Signing in…' : 'Sign in'}
					</Button>
					<AuthFormError
						error={demoSelected ? null : state.error}
						isPending={isPending}
					/>
				</form>

				<OAuthProviderButtons providers={providers} />

				{isDev && (
					<DemoAccountButtons
						accounts={demoAccounts}
						formRef={formRef}
						onDemoSelect={handleDemoSelect}
						passwordRef={passwordRef}
						usernameRef={usernameRef}
					/>
				)}
			</CardContent>
			{registrationEnabled && (
				<AuthFooterLink
					className="pb-6 text-center"
					label="Don't have an account?"
					linkText="Sign up"
					to="/register"
				/>
			)}
		</AuthPageLayout>
	);
}

export { LoginPage };
