import { useQuery } from '@tanstack/react-query';

import { type EventSummary, getEventSummary } from '@/api/businessMetrics';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface EventSummarySectionProps {
	days: number;
}

export function EventSummarySection({ days }: EventSummarySectionProps) {
	const { data: eventsData, isLoading } = useQuery<EventSummary[], Error>({
		queryFn: async () => {
			const res = await getEventSummary(days);
			return res.data;
		},
		queryKey: ['business-metrics-events', days],
	});

	const events = eventsData ?? [];

	return (
		<section className="space-y-3">
			<SectionHeader description="Events by category and name" title="Event Summary" />

			{isLoading ? (
				<ContentListSkeleton showCard />
			) : (
				<Card>
					<CardContent>
						{events.length === 0 ? (
							<p className="text-center text-muted-foreground">
								No event data available
							</p>
						) : (
							/*
							 * Columns sized to the row, with a rule under each one. One full-width
							 * column put the event name at x=289 and its count at x=1385 with ~1000px
							 * of nothing in between at 1440, and ~1150px at 2250 — the name and the
							 * number it belonged to were the two furthest-apart things on the page.
							 * `tabular-nums` is what makes the counts read as a column at all.
							 *
							 * `md:grid-cols-2` fixed the count at two, which only moved the problem up
							 * a viewport: at 2560 the rows were still 695px wide and "login" sat 495px
							 * from its own "154 events". A track floor lets the column count follow the
							 * width instead — 20rem is what the longest row here needs before it
							 * truncates ("settings_tab_change" plus its category badge plus the count
							 * measure ~305px), and it yields four tracks at 2560, three at 1440, two
							 * from `md` up. `min(…,100%)` collapses it to one full-width track on a
							 * phone rather than pushing the page sideways.
							 */
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-x-8">
								{events.map((event) => (
									/*
									 * Uniform rule on every row: the grid fills row-major, so a
									 * `last:` exception would strip the rule from one column's
									 * final row and leave the other's in place.
									 */
									<li
										className="flex items-center justify-between gap-4 border-b py-2"
										key={`${event.eventCategory}-${event.eventName}`}>
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate text-sm font-medium">
												{event.eventName}
											</span>
											<Badge variant="outline">{event.eventCategory}</Badge>
										</span>
										<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
											{/* A row with one event read "1 events". */}
											{event.count} {event.count === 1 ? 'event' : 'events'}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			)}
		</section>
	);
}
