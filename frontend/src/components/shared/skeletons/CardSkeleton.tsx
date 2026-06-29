import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CardSkeletonProps {
	contentLines?: number;
	descriptionWidth?: string;
	titleWidth?: string;
}

export function CardSkeleton({
	contentLines = 5,
	descriptionWidth = 'h-4 w-56',
	titleWidth = 'h-6 w-40',
}: CardSkeletonProps = {}) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className={titleWidth} />
				<Skeleton className={descriptionWidth} />
			</CardHeader>
			<CardContent className="space-y-4">
				{Array.from({ length: contentLines }).map((_, i) => (
					<Skeleton className="h-10 w-full" key={i} />
				))}
			</CardContent>
		</Card>
	);
}
