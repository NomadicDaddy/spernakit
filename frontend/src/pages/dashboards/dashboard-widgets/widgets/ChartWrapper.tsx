import { Suspense } from 'react';

import { useContainerWidth } from '@/hooks/useContainerWidth';

import { WidgetSkeleton } from './WidgetSkeleton';

export function ChartWrapper({
	children,
	data,
	title,
}: {
	children: React.ReactNode;
	data: unknown[];
	title: string;
}) {
	const [containerRef, containerWidth] = useContainerWidth();

	if (!data || data.length === 0) {
		return (
			<div className="flex h-full flex-col">
				<div className="pb-1">
					<span className="text-muted-foreground text-xs font-medium">{title}</span>
				</div>
				<div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
					No data available
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="pb-1">
				<span className="text-muted-foreground text-xs font-medium">{title}</span>
			</div>
			<div className="flex-1" ref={containerRef}>
				{containerWidth > 0 && (
					<Suspense fallback={<WidgetSkeleton title={title} />}>{children}</Suspense>
				)}
			</div>
		</div>
	);
}
