import { Suspense, lazy } from 'react';

import type { HealthHistoryEntry } from '@/api/health';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const HealthTimeline = lazy(() =>
	import('./HealthTimeline').then((m) => ({ default: m.HealthTimeline }))
);

interface HealthTimelineSectionProps {
	historyData: { history: HealthHistoryEntry[] } | undefined;
	historyLoading: boolean;
}

export function HealthTimelineSection({ historyData, historyLoading }: HealthTimelineSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Health Check Timeline</CardTitle>
				<CardDescription>Visual timeline of recent health check results.</CardDescription>
			</CardHeader>
			<CardContent>
				{historyLoading ? (
					<Skeleton className="h-[80px] w-full" />
				) : historyData?.history && historyData.history.length > 0 ? (
					<Suspense fallback={<Skeleton className="h-[80px] w-full" />}>
						<HealthTimeline history={historyData.history} />
					</Suspense>
				) : (
					<p className="text-muted-foreground text-sm">No timeline data available.</p>
				)}
			</CardContent>
		</Card>
	);
}
