import { Activity, Bell, Shield, Users } from 'lucide-react';

import type { DashboardData } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';

function MetricsSummary({
	data,
	isLoading,
}: {
	data: DashboardData | undefined;
	isLoading: boolean;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{isLoading ? (
				<>
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
				</>
			) : (
				<>
					<StatCard
						icon={<Users aria-hidden="true" className="text-muted-foreground size-5" />}
						index={0}
						title="Total Users"
						value={data?.totalUsers ?? 0}
					/>
					<StatCard
						icon={<Bell aria-hidden="true" className="text-muted-foreground size-5" />}
						index={1}
						title="Unread Notifications"
						value={data?.unreadNotifications ?? 0}
					/>
					<StatCard
						icon={
							<Shield aria-hidden="true" className="text-muted-foreground size-5" />
						}
						index={2}
						title="System Health"
						value={data?.systemHealth ?? 'Unknown'}
					/>
					<StatCard
						icon={
							<Activity aria-hidden="true" className="text-muted-foreground size-5" />
						}
						index={3}
						title="Audit Events"
						value={data?.auditEvents ?? 0}
					/>
				</>
			)}
		</div>
	);
}

export { MetricsSummary };
