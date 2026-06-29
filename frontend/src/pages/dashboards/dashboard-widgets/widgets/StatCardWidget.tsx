import type { DashboardWidget } from '@/api/dashboards';

import { useWidgetData } from '@/hooks/dashboards/useWidgetData';

import { METRIC_ICON, NO_WIDGET_DATA_LABEL, resolveMetricValue } from '../widgetHelpers';
import { WidgetSkeleton } from './WidgetSkeleton';

export function StatCardWidget({
	allowPrivateData = true,
	widget,
}: {
	allowPrivateData?: boolean;
	widget: DashboardWidget;
}) {
	const { dashboardData, isLoading } = useWidgetData(widget, { allowPrivateData });

	if (isLoading) return <WidgetSkeleton title={widget.title} />;

	const value = resolveMetricValue(widget.metricType, dashboardData, { formatWithUnit: true });

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<span className="text-muted-foreground text-xs font-medium">{widget.title}</span>
				{METRIC_ICON[widget.metricType]}
			</div>
			<div
				className={
					value === NO_WIDGET_DATA_LABEL
						? 'text-muted-foreground text-sm font-medium'
						: 'text-2xl font-bold tabular-nums'
				}>
				{value}
			</div>
		</div>
	);
}
