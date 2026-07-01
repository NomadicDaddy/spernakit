import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { getSharedDashboard } from '@/api/dashboards';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { DashboardWidgetRenderer } from './dashboard-widgets/DashboardWidgetRenderer';
import { DashboardCardSkeleton } from './DashboardCardSkeleton';

/** Read-only view of a shared dashboard, resolved by a public share token. */
function SharedDashboardPage() {
	const { token } = useParams<{ token: string }>();

	const { data, error, isError, isLoading } = useQuery({
		enabled: !!token,
		queryFn: () => getSharedDashboard(token!),
		queryKey: ['shared-dashboard', token],
		refetchOnWindowFocus: true, // No WebSocket for public shared pages; refresh on focus
		retry: (_failureCount, err) => {
			// Never retry on 429 — retries cause a cascade that exhausts the global
			// rate-limit budget and locks out all endpoints for the entire session.
			if (err instanceof ApiError && err.status === 429) return false;
			return false; // Public page — no auth session to recover; retries add no value
		},
	});

	const dashboard = data?.data;

	if (!token) {
		return (
			<div className="flex flex-col items-center justify-center p-12">
				<h2 className="text-lg font-semibold">Invalid share link</h2>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-6 p-6">
				<Skeleton className="h-8 w-64" />
				<DashboardCardSkeleton cardCount={4} showGrid={true} />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center p-12">
				<h2 className="text-lg font-semibold">Unable to load shared dashboard</h2>
				<p className="text-muted-foreground mt-2 text-sm">
					{error instanceof ApiError
						? `Error ${error.status}`
						: 'An unexpected error occurred'}
				</p>
			</div>
		);
	}

	if (!dashboard) {
		return (
			<div className="flex flex-col items-center justify-center p-12">
				<h2 className="text-lg font-semibold">Dashboard not found or link expired</h2>
			</div>
		);
	}

	return (
		<div className="space-y-4 p-6">
			<PageHeader description="Shared dashboard (read-only)" title={dashboard.name} />

			{dashboard.widgets.length === 0 ? (
				<Card>
					<CardContent className="flex items-center justify-center py-12">
						<p className="text-muted-foreground">This dashboard has no widgets.</p>
					</CardContent>
				</Card>
			) : (
				<div
					className="grid gap-4"
					style={{
						gridTemplateColumns: 'repeat(12, 1fr)',
					}}>
					{dashboard.widgets.map((widget) => (
						<div
							key={widget.id}
							style={{
								gridColumn: `span ${widget.width}`,
								minHeight: `${widget.height * 80}px`,
							}}>
							<DashboardWidgetRenderer allowPrivateData={false} widget={widget} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export { SharedDashboardPage };
