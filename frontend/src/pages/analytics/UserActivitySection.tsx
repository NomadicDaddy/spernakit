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

import { RankedRow } from './RankedRow';
import { getRangeLabel } from './timeRange';

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
						activityData && (
							<UserActivityDetail activityData={activityData} days={days} />
						)
					)}
				</CardContent>
			</Card>
		</section>
	);
}

/** The metrics shown once a user is chosen. */
function UserActivityDetail({
	activityData,
	days,
}: {
	activityData: UserActivityData;
	days: number;
}) {
	const { formatDateTime } = useFormatters();
	const maxCategoryCount = Math.max(0, ...activityData.byCategory.map((c) => c.count));

	return (
		/*
		 * Three panels of one construction. This block used to carry a note saying "no nested
		 * Cards" — but the total beside By Category is a `StatCard`, which *is* a Card, so the rule
		 * was already broken and the breakage is what showed: a bordered, padded tile sat next to a
		 * bare `<p>` label and a naked list in the same grid row, 25px out of line with it. Peers in
		 * one row have to be built the same way. The choice was to strip the shell off the total or
		 * put one on its neighbours, and the total is a KPI — StatCard is that idiom everywhere else
		 * in the app, so it is the neighbours that changed.
		 *
		 * Headings, not `<p>`. "By Category" and "Recent Events" head regions of the page and were
		 * absent from the document outline entirely, so a screen-reader user moving by heading went
		 * from "Select a user" straight past both lists. `h4` because the outline here is already
		 * four deep — PageHeader `h1`, SectionHeader `h2`, the "Select a user" CardTitle `h3` — and
		 * it matches the `headingLevel="h4"` the EmptyState in the same card already uses.
		 */
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={<Activity aria-hidden="true" className="size-5 text-muted-foreground" />}
					subtitle={getRangeLabel(days)}
					/*
					 * Scoped, because /analytics renders two cards reading "Total Events" — the
					 * other is the site-wide total in DashboardStatsSection, four cards up the same
					 * page. Identical label, identical shape, two numbers that mean different
					 * things. The subtitle is the other half of the answer: this figure follows the
					 * range selector, and nothing on the card said so.
					 */
					title="Events by This User"
					value={activityData.totalEvents}
				/>
				<Card>
					<CardHeader>
						<CardTitle as="h4" className="text-sm font-medium">
							By Category
						</CardTitle>
					</CardHeader>
					<CardContent>
						{activityData.byCategory.length === 0 ? (
							<p className="text-sm text-muted-foreground">No categories</p>
						) : (
							/*
							 * `RankedRow`, the same bar the Top Features list above uses — this is
							 * the same events counted a different way, so it should not be a
							 * different shape. It replaces an earlier fix here that split the list
							 * into `minmax(16rem,1fr)` auto-fill tracks to shorten the traverse
							 * between an `outline` category badge and its right-aligned count.
							 * That closed the distance by halving the measure; the bar closes it by
							 * giving the measure a job, and it answers the question a category
							 * breakdown is actually asked — which categories dominate — without
							 * making the reader compare integers.
							 */
							<ul className="space-y-1">
								{activityData.byCategory.map((cat) => (
									<RankedRow
										count={cat.count}
										key={cat.eventCategory}
										label={cat.eventCategory}
										max={maxCategoryCount}
									/>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle as="h4" className="text-sm font-medium">
						Recent Events
					</CardTitle>
				</CardHeader>
				<CardContent>
					{activityData.recentEvents.length === 0 ? (
						<p className="text-sm text-muted-foreground">No recent events</p>
					) : (
						/*
						 * This list is the widest thing on the page — a full-width card at 2560 gives it
						 * ~1424px — and every row is an event name at the left edge with its timestamp at
						 * the right, which measured about 1,100px apart. The same track floor as the two
						 * lists above closes it; 24rem rather than 20rem because a formatted date and time
						 * is ~150px on its own, roughly twice what a count needs.
						 *
						 * `last:border-b-0` is gone with the single column it belonged to: the grid fills
						 * row-major, so it would strip the rule from one column's final row and leave the
						 * others' in place. Every row keeps its hairline.
						 */
						<ul className="grid grid-cols-[repeat(auto-fill,minmax(min(24rem,100%),1fr))] gap-x-8">
							{activityData.recentEvents.map((event, i) => (
								<li
									className="flex items-center justify-between gap-4 border-b py-2 text-sm"
									key={`${event.eventName}-${event.createdAt}-${i}`}>
									<span className="flex min-w-0 items-center gap-2">
										<span className="truncate font-medium">
											{event.eventName}
										</span>
										{/*
										 * `outline`, like the category badges in the By Category list
										 * 24px above it. The same fact — an event's category — was
										 * printed as a filled `secondary` chip in one list and a
										 * hairline `outline` chip in the other, on the same screen, so
										 * the two lists read as showing different kinds of thing.
										 */}
										<Badge variant="outline">{event.eventCategory}</Badge>
									</span>
									<span className="shrink-0 text-muted-foreground tabular-nums">
										{formatDateTime(event.createdAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
