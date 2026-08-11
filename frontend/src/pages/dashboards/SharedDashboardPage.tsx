import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { ApiError } from '@/api/client';
import { getSharedDashboard } from '@/api/dashboards';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { DashboardWidgetRenderer } from './dashboard-widgets/DashboardWidgetRenderer';
import { DashboardCardSkeleton } from './DashboardCardSkeleton';
import { getWidgetMinRows } from './widgetSize';

/**
 * The chrome the public page has instead of the app shell.
 *
 * Everything a signed-in user reads without noticing — which product this is, whether they are
 * looking at something live or a snapshot — arrives through the sidebar and header. A visitor
 * following a share link gets none of it, so the page carries a minimal bar of its own: the same
 * `h-12 md:h-14 border-b` measurements as `Header`, the wordmark treatment from `Sidebar`, and the
 * read-only status as a `Badge` rather than as prose buried in a page description.
 */
function SharedDashboardChrome({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col bg-background">
			<header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 md:h-14">
				<span
					className="bg-clip-text font-display text-xl font-semibold tracking-tight text-transparent"
					style={{ backgroundImage: 'var(--brand-gradient)' }}
					translate="no">
					{__APP_NAME__}
				</span>
				<Badge variant="outline">Read-only shared view</Badge>
			</header>

			{/*
			 * `id="main-content"` and `tabIndex={-1}` because the shell's route-change focus
			 * management does `document.getElementById('main-content')?.focus()` — on this route
			 * there was no such element, so the contract silently did nothing. `space-y-6` is the
			 * baseline section rhythm and is what the page's own loading branch already used; at
			 * `space-y-4` the header-to-content gap tightened by 8px the moment the skeleton was
			 * replaced by the real widgets.
			 */}
			<main
				className="mx-auto w-full max-w-[95rem] flex-1 space-y-6 p-6"
				id="main-content"
				tabIndex={-1}>
				{children}
			</main>

			{/*
			 * A closing edge. Without it the widget grid ends mid-page and roughly 770px of bare
			 * background runs to the bottom of the viewport at 2250x1309, which reads as a page
			 * that failed to finish loading rather than one that has shown everything it has.
			 */}
			<footer className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground">
				<span translate="no">{__APP_NAME__}</span> · Shared dashboards are read-only and
				show no private data.
			</footer>
		</div>
	);
}

/** Read-only view of a shared dashboard, resolved by a public share token. */
function SharedDashboardPage() {
	const { token } = useParams<{ token: string }>();

	const { data, dataUpdatedAt, error, isError, isLoading } = useQuery({
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

	/*
	 * The page knows the dashboard's name and prints it as its h1, but the tab, the bookmark and
	 * the history entry were all titled from the last path segment — the raw share token.
	 * `derivePageTitle` no longer echoes an opaque segment; this puts the real name there.
	 */
	useEffect(() => {
		if (dashboard?.name) {
			document.title = `${dashboard.name} · ${__APP_NAME__}`;
		}
	}, [dashboard?.name]);

	if (!token) {
		return (
			<SharedDashboardChrome>
				<h2 className="text-lg font-semibold">Invalid share link</h2>
			</SharedDashboardChrome>
		);
	}

	if (isLoading) {
		return (
			<SharedDashboardChrome>
				<Skeleton className="h-8 w-64" />
				<DashboardCardSkeleton cardCount={4} showGrid={true} />
			</SharedDashboardChrome>
		);
	}

	if (isError) {
		return (
			<SharedDashboardChrome>
				<h2 className="text-lg font-semibold">Unable to load shared dashboard</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{error instanceof ApiError
						? `Error ${error.status}`
						: 'An unexpected error occurred'}
				</p>
			</SharedDashboardChrome>
		);
	}

	if (!dashboard) {
		return (
			<SharedDashboardChrome>
				<h2 className="text-lg font-semibold">Dashboard not found or link expired</h2>
			</SharedDashboardChrome>
		);
	}

	return (
		<SharedDashboardChrome>
			{/*
			 * Provenance and freshness, not a restatement of the badge. "Shared dashboard
			 * (read-only)" used to live here; a visitor with no account and no other page to
			 * compare against needs to know where the numbers came from and how old they are, and
			 * neither of those was stated anywhere on the page.
			 */}
			<PageHeader
				description={`Live from ${__APP_NAME__} · Updated ${new Date(dataUpdatedAt).toLocaleString()}`}
				title={dashboard.name}
			/>

			{dashboard.widgets.length === 0 ? (
				<Card>
					<CardContent className="flex items-center justify-center py-12">
						<p className="text-muted-foreground">This dashboard has no widgets.</p>
					</CardContent>
				</Card>
			) : (
				/*
				 * The column count reflows; the stored spans do not need to. `repeat(12, 1fr)` was
				 * inline and fixed, so four stat widgets stayed side by side at 1024 in 215px each
				 * and never stacked. A span wider than the explicit grid is clamped to it, so
				 * dropping to six columns and then to one lays the same stored widths out sanely
				 * without rewriting them.
				 */
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12">
					{dashboard.widgets.map((widget) => (
						/*
						 * One named region per widget. The whole page was a single generic
						 * container holding an h1 and then a flat run of static text — "CPU
						 * Usage", "No data available", "Memory Usage", … — with nothing tying a
						 * value to the widget it belongs to. This page has no sidebar or header
						 * landmarks to fall back on, so it needed the structure more than the
						 * authenticated app does.
						 */
						<section
							aria-label={widget.title}
							key={widget.id}
							style={{
								gridColumn: `span ${widget.width}`,
								// Same row floor the editable grid enforces via `minH`. Without it a
								// widget saved at one row renders its value below its own card here
								// too, on the one surface no signed-in user is around to notice.
								minHeight: `${String(Math.max(widget.height, getWidgetMinRows(widget.widgetType)) * 80)}px`,
							}}>
							<DashboardWidgetRenderer allowPrivateData={false} widget={widget} />
						</section>
					))}
				</div>
			)}
		</SharedDashboardChrome>
	);
}

export { SharedDashboardPage };
