import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

import { getDashboardStats, type DashboardStats } from '@/api/businessMetrics';
import { StatCard } from '@/components/shared/charts/StatCard';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';
import { Card, CardContent } from '@/components/ui/card';

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
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
				</div>
				<ContentListSkeleton showCard />
			</>
		);
	}

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={<Users aria-hidden="true" className="text-muted-foreground size-5" />}
					title="Daily Active Users"
					value={dashboardData?.dailyActiveUsers ?? 0}
				/>
				<StatCard
					icon={<Users aria-hidden="true" className="text-muted-foreground size-5" />}
					title="Monthly Active Users"
					value={dashboardData?.monthlyActiveUsers ?? 0}
				/>
				<StatCard
					icon={
						<TrendingUp aria-hidden="true" className="text-muted-foreground size-5" />
					}
					title="Total Events"
					value={dashboardData?.totalEvents ?? 0}
				/>
				<StatCard
					icon={<BarChart3 aria-hidden="true" className="text-muted-foreground size-5" />}
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

			<div className="mt-6">
				<h2 className="text-lg font-semibold">Top Features</h2>
				<p className="text-muted-foreground mt-1 text-sm">Most used features</p>
			</div>

			<Card>
				<CardContent className="p-6">
					<div className="space-y-3">
						{(dashboardData?.topFeatures ?? []).slice(0, 10).map((feature) => (
							<div
								className="flex items-center justify-between"
								key={feature.eventName}>
								<span className="font-medium">{feature.eventName}</span>
								<span className="text-muted-foreground">
									{feature.count} events
								</span>
							</div>
						))}
						{dashboardData?.topFeatures.length === 0 && (
							<p className="text-muted-foreground text-center">
								No feature data available
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</>
	);
}
