import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getMe } from '@/api/auth';
import { BackendUnreachableBanner } from '@/components/shared/BackendUnreachableBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/authStore';

/** OAuth callback handler that syncs the auth store after a server-side redirect. */
function OAuthCallbackPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const setUser = useAuthStore((s) => s.setUser);
	const processedRef = useRef(false);

	useEffect(() => {
		if (processedRef.current) return;
		processedRef.current = true;

		const error = searchParams.get('error');
		if (error) {
			const OAUTH_ERROR_MESSAGES: Record<string, string> = {
				access_denied: 'Access was denied by the OAuth provider.',
				invalid_request: 'The OAuth request was invalid.',
				provider_error: 'The OAuth provider returned an error.',
				server_error: 'An internal server error occurred during authentication.',
				temporarily_unavailable: 'The OAuth provider is temporarily unavailable.',
				unauthorized_client: 'This application is not authorized for OAuth.',
			};
			const message = OAUTH_ERROR_MESSAGES[error] ?? 'OAuth authentication failed.';
			toast.error(message);
			void navigate('/login');
			return;
		}

		// Read CSRF token from the short-lived cookie set by the OAuth callback,
		// then delete the cookie to prevent reuse.
		const csrfCookieName = __CSRF_COOKIE_NAME__;
		function consumeCsrfCookie(): void {
			const escaped = csrfCookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`);
			const match = document.cookie.match(regex);
			if (match?.[1]) {
				const { setCsrfToken } = useAuthStore.getState();
				setCsrfToken(match[1]);
				// Delete the cookie
				document.cookie = `${csrfCookieName}=; Path=/; Max-Age=0`;
			}
		}

		// The OAuth callback is handled server-side, which sets cookies and redirects.
		// If we land here, check auth status to sync the store.
		async function checkAuth() {
			try {
				consumeCsrfCookie();
				const userData = await getMe();
				if (userData) {
					setUser(userData);
					void navigate('/dashboard');
				} else {
					toast.error(
						'OAuth authentication failed. Please try again or sign in with your username and password.'
					);
					void navigate('/login');
				}
			} catch {
				toast.error(
					'OAuth authentication failed. Please try again or sign in with your username and password.'
				);
				void navigate('/login');
			}
		}

		void checkAuth();
	}, [navigate, searchParams, setUser]);

	return (
		<div className="flex min-h-screen items-center justify-center px-4">
			<div className="flex w-full max-w-sm flex-col">
				<BackendUnreachableBanner />
				<Card className="w-full">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">Signing in…</CardTitle>
						<CardDescription>Completing authentication</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export { OAuthCallbackPage };
