import { Heart } from 'lucide-react';

import type { DashboardWidget } from '@/api/dashboards';

import { useWidgetData } from '@/hooks/dashboards/useWidgetData';

import { WidgetFrame } from './WidgetFrame';
import { WidgetSkeleton } from './WidgetSkeleton';

export function HealthStatusWidget({
	allowPrivateData = true,
	widget,
}: {
	allowPrivateData?: boolean;
	widget: DashboardWidget;
}) {
	const { dashboardData, isLoading } = useWidgetData(widget, { allowPrivateData });

	if (isLoading) return <WidgetSkeleton title={widget.title} />;

	const status = dashboardData?.systemHealth ?? 'Unknown';
	/*
	 * Red means unhealthy, not unreported. The map used to fall through to `text-destructive`, so
	 * an indeterminate "Unknown" — the state a shared dashboard with no readings shows — rendered
	 * in 24px bold destructive and became the single most saturated thing on the page.
	 */
	const statusColors: Record<string, string> = {
		degraded: 'text-warning',
		healthy: 'text-success',
		unhealthy: 'text-destructive',
	};
	const statusColor = statusColors[status.toLowerCase()] ?? 'text-muted-foreground';

	return (
		<WidgetFrame
			icon={<Heart aria-hidden="true" className="size-4 text-muted-foreground" />}
			title={widget.title}>
			<div className={`text-2xl leading-tight font-bold capitalize ${statusColor}`}>
				{status}
			</div>
		</WidgetFrame>
	);
}
