import { Skeleton } from '@/components/ui/skeleton';

export function WidgetSkeleton({ title }: { title?: string }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				{title ? (
					<span className="text-xs font-medium text-muted-foreground">{title}</span>
				) : (
					<Skeleton className="h-3 w-24" />
				)}
				<Skeleton className="size-4" />
			</div>
			<Skeleton className="h-8 w-16" />
		</div>
	);
}
