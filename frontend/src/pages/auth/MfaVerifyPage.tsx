import { useActionState, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { getSafeErrorMessage } from '@/api/errorHandling';
import { verifyMfaChallenge, verifyMfaRecovery } from '@/api/mfa';
import { AuthFormError } from '@/components/auth/AuthFormError';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { getFormString } from '@/lib/utils';

interface NavState {
	mfaToken?: string;
}

type VerifyState = { error: null | string };

function MfaVerifyPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { completeMfaLogin, isAuthenticated } = useAuth();
	const [useRecovery, setUseRecovery] = useState(false);

	const stateToken = (location.state as NavState | null)?.mfaToken ?? '';
	// The OAuth flow delivers the token in the URL fragment so it never reaches
	// server logs. Query-param reading is kept as a fallback for one release.
	const hashToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('mfaToken') ?? '';
	const queryToken = new URLSearchParams(location.search).get('mfaToken') ?? '';
	const urlToken = hashToken || queryToken;
	const mfaToken = stateToken || urlToken;

	useEffect(() => {
		if (!urlToken) return;
		void navigate('/mfa-verify', { replace: true, state: { mfaToken: urlToken } });
	}, [navigate, urlToken]);

	const [state, submitAction, isPending] = useActionState<VerifyState, FormData>(
		async (_prev, formData) => {
			try {
				const userData = useRecovery
					? await verifyMfaRecovery(mfaToken, getFormString(formData, 'recoveryCode'))
					: await verifyMfaChallenge(mfaToken, getFormString(formData, 'code'));
				completeMfaLogin(userData);
				void navigate('/dashboard');
				return { error: null };
			} catch (err) {
				// Challenge token invalid/expired → send user back to login
				if (err instanceof ApiError && err.code === 'AUTH_MFA_TOKEN_INVALID') {
					toast.error('Your MFA challenge expired — please sign in again.');
					void navigate('/login', { replace: true });
					return { error: null };
				}
				const message = getSafeErrorMessage(err, 'Verification failed');
				toast.error(message);
				return { error: message };
			}
		},
		{ error: null }
	);

	if (isAuthenticated) {
		return <Navigate replace to="/dashboard" />;
	}
	if (!mfaToken) {
		return <Navigate replace to="/login" />;
	}

	return (
		<AuthPageLayout
			description={
				useRecovery
					? 'Enter one of your saved recovery codes to sign in.'
					: 'Enter the 6-digit code from your authenticator app.'
			}
			title="Two-factor authentication">
			<CardContent>
				<form action={submitAction} className="space-y-4">
					{useRecovery ? (
						<div className="space-y-2">
							<Label htmlFor="recoveryCode">Recovery code</Label>
							<Input
								autoComplete="one-time-code"
								id="recoveryCode"
								name="recoveryCode"
								placeholder="ABCD-EFGH"
								required
								spellCheck={false}
								type="text"
							/>
						</div>
					) : (
						<div className="space-y-2">
							<Label htmlFor="code">Authenticator code</Label>
							<Input
								autoComplete="one-time-code"
								id="code"
								inputMode="numeric"
								maxLength={6}
								minLength={6}
								name="code"
								pattern="[0-9]{6}"
								placeholder="123456"
								required
								spellCheck={false}
								type="text"
							/>
						</div>
					)}
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending && <Spinner className="mr-2" />}
						{isPending ? 'Verifying…' : 'Verify'}
					</Button>
					<AuthFormError error={state.error} isPending={isPending} />
				</form>
				<div className="pt-4 text-center text-sm">
					<button
						className="text-primary hover:underline"
						onClick={() => setUseRecovery((v) => !v)}
						type="button">
						{useRecovery
							? 'Use authenticator code instead'
							: 'Use a recovery code instead'}
					</button>
				</div>
			</CardContent>
		</AuthPageLayout>
	);
}

export { MfaVerifyPage };
