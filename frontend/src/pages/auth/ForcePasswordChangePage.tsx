import { useActionState, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { getMe } from '@/api/auth';
import { apiClient } from '@/api/client';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { BackendUnreachableBanner } from '@/components/shared/BackendUnreachableBanner';
import { PasswordStrengthIndicator } from '@/components/shared/PasswordStrengthIndicator';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { usePasswordPolicy } from '@/hooks/usePasswordPolicy';
import { getFormString } from '@/lib/utils';
import { PASSWORD_MIN_LENGTH, validatePasswordMatch } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

type ChangeState = {
	error: null | string;
};

/** Page shown when a seed/demo account must change its password before continuing. */
function ForcePasswordChangePage() {
	const navigate = useNavigate();
	const { logout } = useAuth();
	const clearUser = useAuthStore((s) => s.logout);
	const requiresPasswordChange = useAuthStore((s) => s.user?.requiresPasswordChange);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const csrfToken = useAuthStore((s) => s.csrfToken);
	const [newPassword, setNewPassword] = useState('');
	const [isSigningOut, setIsSigningOut] = useState(false);
	const { requireSpecialCharacter } = usePasswordPolicy();

	const handleSignOut = async () => {
		if (isSigningOut) return;
		setIsSigningOut(true);
		try {
			await logout();
			void navigate('/login');
		} catch (err) {
			const message = getSafeErrorMessage(err, 'Sign out failed');
			toast.error(message);
			setIsSigningOut(false);
		}
	};

	// Ensure CSRF token is available — if the login response header wasn't captured
	// (e.g., headless browser quirk), fetch a fresh token via /auth/me.
	useEffect(() => {
		if (isAuthenticated && !csrfToken) {
			void getMe();
		}
	}, [isAuthenticated, csrfToken]);

	const [state, submitAction, isPending] = useActionState<ChangeState, FormData>(
		async (_prevState, formData) => {
			const currentPassword = getFormString(formData, 'currentPassword');
			const newPassword = getFormString(formData, 'newPassword');
			const confirmPassword = getFormString(formData, 'confirmPassword');

			const passwordError = validatePasswordMatch(newPassword, confirmPassword, {
				requireSpecialCharacter,
			});
			if (passwordError) {
				return { error: passwordError };
			}

			try {
				await apiClient.put<{ success: boolean }>('/users/me/password', {
					body: { currentPassword, newPassword },
				});
				toast.success('Password changed. Please sign in again.');
				clearUser();
				void navigate('/login');
				return { error: null };
			} catch (err) {
				const message = getSafeErrorMessage(err, 'Password change failed');
				toast.error(message);
				return { error: message };
			}
		},
		{ error: null }
	);

	if (!isAuthenticated) {
		return <Navigate replace to="/login" />;
	}

	if (!requiresPasswordChange) {
		return <Navigate replace to="/dashboard" />;
	}

	return (
		<div className="flex min-h-screen items-center justify-center px-4">
			<div className="flex w-full max-w-sm flex-col">
				<BackendUnreachableBanner />
				<Card className="w-full">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">Change Your Password</CardTitle>
						<CardDescription>
							Your account requires a password change before you can continue.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form action={submitAction} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="currentPassword">Current Password</Label>
								<Input
									autoComplete="current-password"
									id="currentPassword"
									name="currentPassword"
									placeholder="Enter your current password…"
									required
									type="password"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="newPassword">New Password</Label>
								<Input
									autoComplete="new-password"
									id="newPassword"
									name="newPassword"
									onChange={(e) => {
										setNewPassword(e.target.value);
									}}
									placeholder={`New password (min ${PASSWORD_MIN_LENGTH} characters)`}
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
									name="confirmPassword"
									placeholder="Retype your new password…"
									required
									type="password"
								/>
							</div>
							<Button className="w-full" disabled={isPending} type="submit">
								{isPending && <Spinner className="mr-2" size={16} />}
								{isPending ? 'Changing password…' : 'Change Password'}
							</Button>
							{state.error && !isPending && (
								<p
									aria-live="polite"
									className="text-destructive text-center text-sm"
									role="alert">
									{state.error}
								</p>
							)}
						</form>
						<Button
							className="mt-4 w-full"
							disabled={isSigningOut}
							onClick={() => {
								void handleSignOut();
							}}
							type="button"
							variant="ghost">
							{isSigningOut ? 'Signing out…' : 'Sign out'}
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export { ForcePasswordChangePage };
