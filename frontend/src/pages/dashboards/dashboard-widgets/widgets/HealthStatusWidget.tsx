import { Heart } from 'lucide-react';

import type { DashboardWidget } from '@/api/dashboards';

import { useWidgetData } from '@/hooks/dashboards/useWidgetData';

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
	const statusColors: Record<string, string> = {
		degraded: 'text-yellow-500',
		healthy: 'text-green-500',
	};
	const statusColor = statusColors[status] ?? 'text-red-500';

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<span className="text-muted-foreground text-xs font-medium">{widget.title}</span>
				<Heart aria-hidden="true" className="text-muted-foreground size-4" />
			</div>
			<div className={`text-2xl font-bold capitalize ${statusColor}`}>{status}</div>
		</div>
	);
}
