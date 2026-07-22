import type { ReactNode } from 'react';

import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { preconnect } from 'react-dom';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { useSyncUiSettings } from '@/hooks/useSyncUiSettings';
import { useTheme } from '@/hooks/useTheme';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes';

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
				<Toaster />
			</ThemeApplicator>
		</QueryClientProvider>
	);
}

export { App };
