import { useQuery } from '@tanstack/react-query';
import { Activity, UserSearch } from 'lucide-react';
import { useState } from 'react';

import { getUserActivity, type UserActivityData } from '@/api/businessMetrics';
import { listUsers } from '@/api/users';
import { StatCard } from '@/components/shared/charts/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
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

	/*
	 * Raw API order — viewer, sysop, admin, manager, operator — is neither alphabetical nor by id,
	 * and every label carried the row id as a bare "(#5)". In a picker meant to be scanned, an
	 * arbitrary order plus an unexplained numeric suffix costs more than it gives; the email is the
	 * disambiguator when two accounts share a display name.
	 */
	const users = [...(usersData ?? [])].sort((a, b) => a.username.localeCompare(b.username));

	return (
		/*
		 * The section is a card like every other section on the page. It used to be a heading, a
		 * description and a naked 220px Select with nothing under it — the default state every
		 * visitor lands on — so the page trailed off into several hundred pixels of empty canvas
		 * with no indication that anything was ever going to appear there.
		 */
		<section className="space-y-3">
			<SectionHeader description="Activity for an individual user" title="User Activity" />

			<Card>
				<CardHeader>
					<CardTitle as="h3">Select a user</CardTitle>
					<CardDescription>
						Their event totals and recent activity appear below.
					</CardDescription>
					<CardAction>
						<Select
							onValueChange={(value) => {
								setSelectedUserId(value ? Number(value) : null);
							}}
							value={selectedUserId !== null ? String(selectedUserId) : ''}>
							<SelectTrigger aria-label="Select user" className="w-[220px]">
								<SelectValue placeholder="Select a user…" />
							</SelectTrigger>
							<SelectContent>
								{users.map((u) => (
									<SelectItem key={u.id} value={String(u.id)}>
										{u.username}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</CardAction>
				</CardHeader>
				<CardContent>
					{selectedUserId === null ? (
						<EmptyState
							description="Pick a user from the list to see their event totals, category breakdown and recent activity."
							headingLevel="h4"
							icon={UserSearch}
							title="No user selected"
							variant="compact"
						/>
					) : activityLoading ? (
						<ContentListSkeleton />
					) : (
						activityData && <UserActivityDetail activityData={activityData} />
					)}
				</CardContent>
			</Card>
		</section>
	);
}

/** The metrics shown once a user is chosen. */
function UserActivityDetail({ activityData }: { activityData: UserActivityData }) {
	const { formatDateTime } = useFormatters();

	return (
		/*
		 * No nested `Card`s. This already renders inside the section's card, so the previous
		 * shape put a bordered panel inside a bordered panel inside the page — three shells for
		 * one list. Plain sub-headings carry the same grouping at a fraction of the ink.
		 */
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={<Activity aria-hidden="true" className="size-5 text-muted-foreground" />}
					title="Total Events"
					value={activityData.totalEvents}
				/>
				<div className="space-y-2">
					<p className="text-sm font-medium">By Category</p>
					{activityData.byCategory.length === 0 ? (
						<p className="text-sm text-muted-foreground">No categories</p>
					) : (
						<ul className="space-y-1">
							{activityData.byCategory.map((cat) => (
								<li
									className="flex items-center justify-between gap-4 text-sm"
									key={cat.eventCategory}>
									<Badge variant="outline">{cat.eventCategory}</Badge>
									<span className="text-muted-foreground tabular-nums">
										{cat.count}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium">Recent Events</p>
				{activityData.recentEvents.length === 0 ? (
					<p className="text-sm text-muted-foreground">No recent events</p>
				) : (
					<ul>
						{activityData.recentEvents.map((event, i) => (
							<li
								className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0"
								key={`${event.eventName}-${event.createdAt}-${i}`}>
								<span className="flex min-w-0 items-center gap-2">
									<span className="truncate font-medium">{event.eventName}</span>
									<Badge variant="secondary">{event.eventCategory}</Badge>
								</span>
								<span className="shrink-0 text-muted-foreground tabular-nums">
									{formatDateTime(event.createdAt)}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
