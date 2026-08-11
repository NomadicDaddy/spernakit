import { Suspense } from 'react';

import type { ContainerSize } from '@/hooks/useContainerWidth';

import { Skeleton } from '@/components/ui/skeleton';
import { useContainerSize } from '@/hooks/useContainerWidth';

import { WidgetFrame } from './WidgetFrame';

/**
 * The shell shared by the chart widgets. The title goes through {@link WidgetFrame} for the same
 * reason the single-value widgets do: a dashboard grid mixing a Stat Card and a Line Chart labelled
 * them at two different sizes and two different colours, so the two halves of one grid did not read
 * as one system. One frame owns the title treatment; this owns the plot area.
 *
 * `children` is a **function of the measured plot area**, not an element. A recharts chart is sized
 * by its `width` and `height` props — it does not fill its parent — so a bare `<AreaChart>` handed
 * to this wrapper rendered a `.recharts-wrapper` at height 0 with no children at all: a widget with
 * a title and an empty rectangle under it. The grid gives each widget a row height rather than a
 * fixed pixel height, so the numbers can only come from measuring, and only this component knows
 * the element to measure.
 */
export function ChartWrapper({
	children,
	data,
	title,
}: {
	children: (size: ContainerSize) => React.ReactNode;
	data: unknown[];
	title: string;
}) {
	const [containerRef, containerSize] = useContainerSize();

	if (!data || data.length === 0) {
		return (
			<WidgetFrame title={title}>
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					No data available
				</div>
			</WidgetFrame>
		);
	}

	return (
		<WidgetFrame title={title}>
			{/*
			 * A bare `Skeleton` rather than `WidgetSkeleton`: the frame above already renders the
			 * title, and the fallback used to render it a second time inside the plot area, so a
			 * chart loading its lazy chunk briefly showed its own name twice.
			 */}
			<div className="min-h-0 flex-1" ref={containerRef}>
				{containerSize.height > 0 && containerSize.width > 0 && (
					<Suspense fallback={<Skeleton className="size-full" />}>
						{children(containerSize)}
					</Suspense>
				)}
			</div>
		</WidgetFrame>
	);
}
