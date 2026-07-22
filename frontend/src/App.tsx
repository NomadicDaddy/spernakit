import type { ReactNode } from 'react';

import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { preconnect } from 'react-dom';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useSyncUiSettings } from '@/hooks/useSyncUiSettings';
import { useTheme } from '@/hooks/useTheme';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes';

// Lazy-load the Toaster so sonner (~22 KB gzip) stays off the critical path.
// Toasts are triggered by API errors and user actions, never by first paint.
const Toaster = lazy(() => import('@/components/ui/sonner').then((m) => ({ default: m.Toaster })));

function ThemeApplicator({ children }: { children: ReactNode }) {
	useTheme();
	useSyncUiSettings();
	return <>{children}</>;
}

preconnect(window.location.origin);

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeApplicator>
				<QueryErrorResetBoundary>
					{({ reset }) => (
						<ErrorBoundary onReset={reset}>
							<RouterProvider router={router} />
						</ErrorBoundary>
					)}
				</QueryErrorResetBoundary>
				<Suspense fallback={null}>
					<Toaster />
				</Suspense>
			</ThemeApplicator>
		</QueryClientProvider>
	);
}

export { App };
