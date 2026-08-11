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
							 * Two columns with a rule under each row. One full-width column put the
							 * event name at x=289 and its count at x=1385 with ~1000px of nothing in
							 * between at 1440, and ~1150px at 2250 — the name and the number it
							 * belonged to were the two furthest-apart things on the page. Halving the
							 * measure and giving each row a hairline gets both back into one glance;
							 * `tabular-nums` is what makes the counts read as a column at all.
							 */
							<ul className="grid gap-x-8 md:grid-cols-2">
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
											{event.count} events
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
