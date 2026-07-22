import { useQuery } from '@tanstack/react-query';

import { getEventSummary, type EventSummary } from '@/api/businessMetrics';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
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

	return (
		<>
			<div className="mt-6">
				<h2 className="text-lg font-semibold">Event Summary</h2>
				<p className="text-muted-foreground mt-1 text-sm">Events by category and name</p>
			</div>

			{isLoading ? (
				<ContentListSkeleton showCard />
			) : (
				<Card>
					<CardContent className="p-6">
						<div className="space-y-3">
							{(eventsData ?? []).map((event) => (
								<div
									className="flex items-center justify-between"
									key={`${event.eventCategory}-${event.eventName}`}>
									<div>
										<span className="font-medium">{event.eventName}</span>
										<span className="text-muted-foreground ml-2 text-sm">
											({event.eventCategory})
										</span>
									</div>
									<span className="text-muted-foreground">
										{event.count} events
									</span>
								</div>
							))}
							{eventsData?.length === 0 && (
								<p className="text-muted-foreground text-center">
									No event data available
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</>
	);
}
