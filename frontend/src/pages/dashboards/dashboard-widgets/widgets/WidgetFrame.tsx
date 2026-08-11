import type { ReactNode } from 'react';

/**
 * The title-plus-value shell shared by the single-value widgets (stat card, gauge, health status).
 *
 * The value sits in a `flex-1` region that centres it vertically rather than stacking directly
 * beneath the title. At the shortest row heights the card's interior is only a few pixels taller
 * than a `text-2xl` line box, and stacked content that overruns loses its descenders off the
 * bottom — the digits get amputated. Centred content that overruns loses a pixel at each end
 * instead, which reads as tight rather than broken.
 *
 * `min-h-0` is what allows that region to shrink at all: a flex child's default minimum is its
 * content's height, so without it the value would push the title out of the card rather than
 * absorb the shortfall itself.
 */
function WidgetFrame({
	children,
	icon,
	title,
}: {
	children: ReactNode;
	icon?: ReactNode;
	title: string;
}) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-2 pb-1">
				{/*
				 * `text-sm font-medium` in the foreground colour — the same treatment `CardTitle`
				 * gives the KPI cards on /dashboard. At `text-xs` muted, a Stat Card widget showing
				 * the identical number as a /dashboard KPI card labelled it two steps smaller and a
				 * shade fainter, so the two dashboards did not read as the same system.
				 */}
				<span className="truncate text-sm font-medium">{title}</span>
				{icon}
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
		</div>
	);
}

export { WidgetFrame };
