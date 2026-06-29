import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ContentListSkeletonProps {
	/** Number of skeleton lines to render */
	lineCount?: number;
	/** Height class for each skeleton line (e.g. 'h-8', 'h-10', 'h-16') */
	lineHeight?: string;
	/** Wrap the skeleton lines in a Card/CardContent */
	showCard?: boolean;
	/** Spacing between lines (e.g. 'space-y-2', 'space-y-4') */
	spacing?: string;
}

export function ContentListSkeleton({
	lineCount = 3,
	lineHeight = 'h-8',
	showCard = false,
	spacing = 'space-y-4',
}: ContentListSkeletonProps) {
	const lines = (
		<div className={spacing}>
			{Array.from({ length: lineCount }).map((_, i) => (
				<Skeleton className={`${lineHeight} w-full`} key={i} />
			))}
		</div>
	);

	if (showCard) {
		return (
			<Card>
				<CardContent className="p-6">{lines}</CardContent>
			</Card>
		);
	}

	return lines;
}
