import { Activity, Bell, Network, Shield, Users, Wifi } from 'lucide-react';

import type { DashboardData } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';

/**
 * How a reported health string is painted.
 *
 * The System Health card is the only KPI whose value is a state rather than a number, and it
 * rendered in the same neutral near-white as the counts beside it — so the one card carrying a
 * status read as inert. `StatCard` already ships the border, gradient and icon-chip treatments;
 * nothing passed it a variant.
 */
const HEALTH_VARIANTS: Record<string, 'destructive' | 'success' | 'warning'> = {
	degraded: 'warning',
	healthy: 'success',
	unhealthy: 'destructive',
};

/** Sentence case, so a reported "healthy" and the "Unknown" fallback read as one vocabulary. */
function healthLabel(status: string | undefined): string {
	if (!status) return 'Unknown';
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function MetricsSummary({
	data,
	isLoading,
}: {
	data: DashboardData | undefined;
	isLoading: boolean;
}) {
	const health = data?.systemHealth?.toLowerCase();

	return (
		/*
		 * A `<section>` at 12px, inside the page's 24px stack. As flat siblings of DashboardPage's
		 * `space-y-6` the header and its grid sat exactly 24px apart — the same distance as the gap
		 * to the section that ended above — so all seven boundaries on the page measured 24px and a
		 * title was no more attached to the cards it labelled than to the previous section's. 12px
		 * inside against 24px between is the rhythm /analytics already uses for the same shape.
		 */
		<section className="space-y-3">
			<SectionHeader description="Users, activity and current load" title="Overview" />

			{/*
			 * Three-up at `xl`, not four-up at `lg`. The 15rem sidebar and the 24px page padding
			 * leave this grid ~784px at a 1024 viewport, so a four-column step there gave each
			 * card ~185px and wrapped five of the six titles onto two lines — which pushed their
			 * values down and broke the shared baseline across the row. The column count now
			 * tracks the canvas the cards actually get rather than the window width.
			 *
			 * Six-up above 1536px. Three-up held at every desktop width, which gave each of these
			 * six cards 480px at 2560 to carry a 14px label and a one-to-three character number,
			 * and wrapped the band onto two rows costing 300px of height before the first real
			 * content. The narrower steps are unchanged — they are sized to the canvas, and the
			 * canvas at 2560 is simply not the same problem.
			 */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
				{isLoading ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<StatCard
							icon={
								<Users
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							}
							index={0}
							title="Total Users"
							value={data?.totalUsers ?? 0}
						/>
						<StatCard
							icon={
								<Bell aria-hidden="true" className="size-5 text-muted-foreground" />
							}
							index={1}
							title="Unread Notifications"
							value={data?.unreadNotifications ?? 0}
						/>
						<StatCard
							icon={
								<Shield
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							}
							index={2}
							title="System Health"
							value={healthLabel(data?.systemHealth)}
							{...(health && HEALTH_VARIANTS[health]
								? { variant: HEALTH_VARIANTS[health] }
								: {})}
						/>
						<StatCard
							icon={
								<Activity
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							}
							index={3}
							title="Audit Events"
							value={data?.auditEvents ?? 0}
						/>
						{/*
						 * The two plain counters, moved up from System Metrics. They carry a title
						 * and a number and nothing else, so in a row beside Memory and CPU — which
						 * carry a value, a trend delta, a sparkline and a progress bar — stretch
						 * alignment left each of them with ~140px of empty card. Here every card in
						 * the grid has the same content shape.
						 */}
						<StatCard
							icon={
								<Network
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							}
							index={4}
							title="Request Count"
							value={data?.metrics.requestCount ?? 0}
						/>
						<StatCard
							icon={
								<Wifi aria-hidden="true" className="size-5 text-muted-foreground" />
							}
							index={5}
							title="Active Connections"
							value={data?.metrics.activeConnections ?? 0}
						/>
					</>
				)}
			</div>
		</section>
	);
}

export { MetricsSummary };
