import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardCardSkeletonProps {
	cardCount?: number;
	showGrid?: boolean;
}

export function DashboardCardSkeleton({
	cardCount = 4,
	showGrid = true,
}: DashboardCardSkeletonProps = {}) {
	const cards = Array.from({ length: cardCount });
	const cardContent = (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-32" />
				<Skeleton className="h-4 w-48" />
			</CardHeader>
		</Card>
	);

	if (showGrid) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{cards.map((_, i) => (
					<div key={i}>{cardContent}</div>
				))}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{cards.map((_, i) => (
				<div key={i}>{cardContent}</div>
			))}
		</div>
	);
}
