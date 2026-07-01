import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense } from 'react';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteAnnouncement } from '@/routes/useRouteAnnouncement';

function PageFallback() {
	return (
		<div className="space-y-4 p-6">
			<Skeleton className="h-8 w-48" />
			<Skeleton className="h-4 w-96" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

function LazyPage({ Component }: { Component: React.LazyExoticComponent<React.ComponentType> }) {
	useRouteAnnouncement();
	return (
		<QueryErrorResetBoundary>
			{({ reset }) => (
				<ErrorBoundary onReset={reset}>
					<Suspense fallback={<PageFallback />}>
						<Component />
					</Suspense>
				</ErrorBoundary>
			)}
		</QueryErrorResetBoundary>
	);
}

export { LazyPage };
