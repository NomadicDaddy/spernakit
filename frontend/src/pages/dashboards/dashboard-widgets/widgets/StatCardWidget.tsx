import type { DashboardWidget } from '@/api/dashboards';

import { useWidgetData } from '@/hooks/dashboards/useWidgetData';

import { METRIC_ICON, NO_WIDGET_DATA_LABEL, resolveMetricValue } from '../widgetHelpers';
import { WidgetFrame } from './WidgetFrame';
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
		<WidgetFrame icon={METRIC_ICON[widget.metricType]} title={widget.title}>
			<div
				className={
					value === NO_WIDGET_DATA_LABEL
						? 'text-sm font-medium text-muted-foreground'
						: 'text-2xl leading-tight font-bold tabular-nums'
				}>
				{value}
			</div>
		</WidgetFrame>
	);
}
