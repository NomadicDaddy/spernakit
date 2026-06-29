import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
	className?: string;
	rowHeight?: string;
	rows?: number;
}

export function TableSkeleton({
	className = '',
	rowHeight = 'h-12',
	rows = 5,
}: TableSkeletonProps) {
	return (
		<div className={`space-y-3 ${className}`}>
			{Array.from({ length: rows }).map((_, i) => (
				<Skeleton className={`${rowHeight} w-full`} key={i} />
			))}
		</div>
	);
}
