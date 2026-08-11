import { Skeleton } from '@/components/ui/skeleton';

import { WidgetFrame } from './WidgetFrame';

/**
 * The loading state for every single-value widget. When the title is already known — it comes from
 * the saved widget, not from the request — it renders through {@link WidgetFrame} rather than
 * restating the title markup, so the label does not change size and colour the instant the data
 * arrives. Without a title there is no text to make consistent, so the bar stands in for it.
 */
export function WidgetSkeleton({ title }: { title?: string }) {
	if (title) {
		return (
			<WidgetFrame icon={<Skeleton className="size-4" />} title={title}>
				<Skeleton className="h-8 w-16" />
			</WidgetFrame>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<Skeleton className="h-3 w-24" />
				<Skeleton className="size-4" />
			</div>
			<Skeleton className="h-8 w-16" />
		</div>
	);
}
