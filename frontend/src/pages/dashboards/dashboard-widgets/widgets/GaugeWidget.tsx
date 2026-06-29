import type { MetricType } from '@/api/dashboards';
import type { DashboardWidget } from '@/api/dashboards';

import { Progress } from '@/components/ui/progress';
import { useWidgetData } from '@/hooks/dashboards/useWidgetData';

import { METRIC_ICON, resolveMetricValue } from '../widgetHelpers';
import { WidgetSkeleton } from './WidgetSkeleton';

/** Metrics that represent percentage values and should display a % suffix. */
const PERCENTAGE_METRICS: ReadonlySet<MetricType> = new Set(['cpu_usage', 'memory_usage']);

function formatGaugeValue(metricType: MetricType, value: number | string): string {
	if (typeof value === 'string') return value;
	if (PERCENTAGE_METRICS.has(metricType)) return `${value}%`;
	return String(value);
}

export function GaugeWidget({
	allowPrivateData = true,
	widget,
}: {
	allowPrivateData?: boolean;
	widget: DashboardWidget;
}) {
	const { dashboardData, isLoading } = useWidgetData(widget, { allowPrivateData });

	if (isLoading) return <WidgetSkeleton title={widget.title} />;

	const value = resolveMetricValue(widget.metricType, dashboardData, { clampTo100: true });
	const hasNumericValue = typeof value === 'number';

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<span className="text-muted-foreground text-xs font-medium">{widget.title}</span>
				{METRIC_ICON[widget.metricType]}
			</div>
			<div className="space-y-2">
				<div
					className={
						hasNumericValue
							? 'text-2xl font-bold tabular-nums'
							: 'text-muted-foreground text-sm font-medium'
					}>
					{formatGaugeValue(widget.metricType, value)}
				</div>
				{hasNumericValue && <Progress value={value} />}
			</div>
		</div>
	);
}
