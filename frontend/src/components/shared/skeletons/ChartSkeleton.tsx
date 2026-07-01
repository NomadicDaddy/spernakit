import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ChartSkeletonProps {
	showHeader?: boolean;
}

function ChartSkeleton({ showHeader = true }: ChartSkeletonProps = {}) {
	return (
		<Card>
			{showHeader && (
				<CardHeader className="pb-2">
					<Skeleton className="h-4 w-32" />
				</CardHeader>
			)}
			<CardContent>
				<Skeleton className="h-[200px] w-full" />
			</CardContent>
		</Card>
	);
}

export { ChartSkeleton };
