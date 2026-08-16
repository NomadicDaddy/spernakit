import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

import { type DashboardStats, getDashboardStats } from '@/api/businessMetrics';
import { StatCard } from '@/components/shared/charts/StatCard';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';
import { Card, CardContent } from '@/components/ui/card';

import { RankedRow } from './RankedRow';
import { getRangeLabel } from './timeRange';

interface DashboardStatsSectionProps {
	days: number;
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
			 *
			 * `index` is what turns StatCard's `animate-fade-up` into the 40ms stagger /dashboard's
			 * MetricsSummary already uses. Without it all four cards carried the animation with no
			 * delay and entered as one slab, so the same component introduced itself two different
			 * ways on the two surfaces the app most wants to feel alike.
			 */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={<Users aria-hidden="true" className="size-5 text-muted-foreground" />}
					index={0}
					subtitle="Today"
					title="Daily Active Users"
					value={dashboardData?.dailyActiveUsers ?? 0}
				/>
				<StatCard
					icon={<Users aria-hidden="true" className="size-5 text-muted-foreground" />}
					index={1}
					subtitle="Rolling 30 days"
					title="Monthly Active Users"
					value={dashboardData?.monthlyActiveUsers ?? 0}
				/>
				<StatCard
					icon={
						<TrendingUp aria-hidden="true" className="size-5 text-muted-foreground" />
					}
					index={2}
					subtitle={rangeLabel}
					title="Total Events"
					value={dashboardData?.totalEvents ?? 0}
				/>
				<StatCard
					icon={<BarChart3 aria-hidden="true" className="size-5 text-muted-foreground" />}
					index={3}
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
