import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

import { type DashboardStats, getDashboardStats } from '@/api/businessMetrics';
import { StatCard } from '@/components/shared/charts/StatCard';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';
import { Card, CardContent } from '@/components/ui/card';

import { getRangeLabel } from './timeRange';

interface DashboardStatsSectionProps {
	days: number;
}

/**
 * One ranked row of the Top Features list.
 *
 * The row used to be a bare `flex justify-between`, which put the feature name and its count at
 * opposite edges of a card up to 1400px wide with roughly 1000px of nothing between them, and no
 * separator, alignment or proportion to tie them together. The bar behind the row is what "top
 * features" is actually asking for — rank plus share, readable without reading the numbers — and it
 * gives the width something to do.
 */
function RankedRow({ count, label, max }: { count: number; label: string; max: number }) {
	const share = max > 0 ? Math.max((count / max) * 100, 2) : 0;

	return (
		<li className="relative overflow-hidden rounded-md">
			<div
				aria-hidden="true"
				className="absolute inset-y-0 left-0 bg-primary/10"
				style={{ width: `${String(share)}%` }}
			/>
			<div className="relative flex items-center justify-between gap-4 px-3 py-2">
				<span className="min-w-0 truncate text-sm font-medium">{label}</span>
				<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
					{count} events
				</span>
			</div>
		</li>
	);
}

export function DashboardStatsSection({ days }: DashboardStatsSectionProps) {
	const { data: dashboardData, isLoading } = useQuery<DashboardStats, Error>({
		queryFn: async () => {
			const res = await getDashboardStats(days);
			return res.data;
		},
		queryKey: ['business-metrics-dashboard', days],
	});

	if (isLoading) {
		return (
			<>
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
				</div>
				<ContentListSkeleton showCard />
			</>
		);
	}

	const topFeatures = (dashboardData?.topFeatures ?? []).slice(0, 10);
	const maxCount = topFeatures[0]?.count ?? 0;
	const rangeLabel = getRangeLabel(days);

	return (
		<>
			{/*
			 * Four across at `xl`, not `lg`. Tailwind's breakpoints measure the viewport, but this
			 * grid lives in a canvas the 240px sidebar and 24px page padding have already taken
			 * ~264px out of — so `lg:` fired at a 1024 viewport against ~724px of real width, two of
			 * the four titles wrapped, and their values stopped sharing a baseline with the other two.
			 *
			 * The subtitles are not decoration either. Total Events and Conversions follow the range
			 * selector; Daily and Monthly Active Users are fixed-window by definition and do not
			 * move when the range changes. Four identical tiles under one selector said otherwise.
			 */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={<Users aria-hidden="true" className="size-5 text-muted-foreground" />}
					subtitle="Today"
					title="Daily Active Users"
					value={dashboardData?.dailyActiveUsers ?? 0}
				/>
				<StatCard
					icon={<Users aria-hidden="true" className="size-5 text-muted-foreground" />}
					subtitle="Rolling 30 days"
					title="Monthly Active Users"
					value={dashboardData?.monthlyActiveUsers ?? 0}
				/>
				<StatCard
					icon={
						<TrendingUp aria-hidden="true" className="size-5 text-muted-foreground" />
					}
					subtitle={rangeLabel}
					title="Total Events"
					value={dashboardData?.totalEvents ?? 0}
				/>
				<StatCard
					icon={<BarChart3 aria-hidden="true" className="size-5 text-muted-foreground" />}
					subtitle={rangeLabel}
					title="Conversions"
					value={
						dashboardData
							? dashboardData.conversionRates.fileUploads +
								dashboardData.conversionRates.registrations +
								dashboardData.conversionRates.workspaceCreations
							: 0
					}
				/>
			</div>

			{/*
			 * Heading and card in one `<section>`. Each section title used to be a bare sibling in
			 * the page's `space-y-6` stack, sitting exactly 24px below the previous card and exactly
			 * 24px above its own — so nothing grouped a heading to the content it labelled. 12px
			 * inside the section against 24px between sections makes the grouping unambiguous, and
			 * `SectionHeader` puts the title on the app's type scale instead of hand-rolled
			 * `text-lg font-semibold`.
			 */}
			<section className="space-y-3">
				<SectionHeader description="Most used features" title="Top Features" />
				<Card>
					<CardContent>
						{topFeatures.length === 0 ? (
							<p className="text-center text-muted-foreground">
								No feature data available
							</p>
						) : (
							<ul className="space-y-1">
								{topFeatures.map((feature) => (
									<RankedRow
										count={feature.count}
										key={feature.eventName}
										label={feature.eventName}
										max={maxCount}
									/>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</section>
		</>
	);
}
