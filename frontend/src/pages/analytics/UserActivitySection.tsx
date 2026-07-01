import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useState } from 'react';

import { getUserActivity, type UserActivityData } from '@/api/businessMetrics';
import { listUsers } from '@/api/users';
import { StatCard } from '@/components/shared/charts/StatCard';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useFormatters } from '@/hooks/useFormatters';

interface UserActivitySectionProps {
	days: number;
}

export function UserActivitySection({ days }: UserActivitySectionProps) {
	const { formatDateTime } = useFormatters();
	const [selectedUserId, setSelectedUserId] = useState<null | number>(null);

	const { data: usersData } = useQuery({
		queryFn: async () => {
			const res = await listUsers({ limit: '100' });
			return res.data;
		},
		queryKey: ['users-for-activity'],
	});

	const { data: activityData, isLoading: activityLoading } = useQuery<UserActivityData, Error>({
		enabled: selectedUserId !== null,
		queryFn: async () => {
			const res = await getUserActivity(selectedUserId!, days);
			return res.data;
		},
		queryKey: ['business-metrics-user-activity', selectedUserId, days],
	});

	return (
		<>
			<div className="mt-6">
				<h2 className="text-lg font-semibold">User Activity</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					Per-user activity metrics (ADMIN)
				</p>
			</div>

			<div className="flex items-center gap-4">
				<Select
					onValueChange={(value) => {
						setSelectedUserId(value ? Number(value) : null);
					}}
					value={selectedUserId !== null ? String(selectedUserId) : ''}>
					<SelectTrigger aria-label="Select user" className="w-[220px]">
						<SelectValue placeholder="Select a user…" />
					</SelectTrigger>
					<SelectContent>
						{(usersData ?? []).map((u) => (
							<SelectItem key={u.id} value={String(u.id)}>
								{u.username} (#{u.id})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{selectedUserId !== null && activityLoading && <ContentListSkeleton showCard />}

			{selectedUserId !== null && !activityLoading && activityData && (
				<div className="mt-4 space-y-4">
					<div className="grid gap-4 sm:grid-cols-3">
						<StatCard
							icon={
								<Activity
									aria-hidden="true"
									className="text-muted-foreground size-5"
								/>
							}
							title="Total Events"
							value={activityData.totalEvents}
						/>
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium">By Category</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-1">
									{activityData.byCategory.map((cat) => (
										<div
											className="flex items-center justify-between text-sm"
											key={cat.eventCategory}>
											<Badge variant="outline">{cat.eventCategory}</Badge>
											<span className="text-muted-foreground">
												{cat.count}
											</span>
										</div>
									))}
									{activityData.byCategory.length === 0 && (
										<p className="text-muted-foreground text-sm">
											No categories
										</p>
									)}
								</div>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-medium">Recent Events</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{activityData.recentEvents.map((event, i) => (
									<div
										className="flex items-center justify-between text-sm"
										key={`${event.eventName}-${event.createdAt}-${i}`}>
										<div className="flex items-center gap-2">
											<span className="font-medium">{event.eventName}</span>
											<Badge variant="secondary">{event.eventCategory}</Badge>
										</div>
										<span className="text-muted-foreground">
											{formatDateTime(event.createdAt)}
										</span>
									</div>
								))}
								{activityData.recentEvents.length === 0 && (
									<p className="text-muted-foreground text-center">
										No recent events
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</>
	);
}
