import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardWidget } from '@/api/dashboards';

import { useChartData } from '@/hooks/dashboards/useChartData';
import { useWidgetData } from '@/hooks/dashboards/useWidgetData';
import { useFormatters } from '@/hooks/useFormatters';
import { CHART_MARGIN, TOOLTIP_STYLE, XAXIS_PROPS, YAXIS_PROPS } from '@/lib/chartConstants';

import { ChartWrapper } from './ChartWrapper';
import { WidgetSkeleton } from './WidgetSkeleton';

const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0];

export function BarChartWidget({
	allowPrivateData = true,
	widget,
}: {
	allowPrivateData?: boolean;
	widget: DashboardWidget;
}) {
	const { isLoading, metricsData } = useWidgetData(widget, { allowPrivateData });
	const chartData = useChartData(metricsData, widget.metricType);
	const { formatTime } = useFormatters();

	if (isLoading) return <WidgetSkeleton title={widget.title} />;

	return (
		<ChartWrapper data={chartData} title={widget.title}>
			<BarChart data={chartData} key={`bar-chart-${widget.id}`} margin={CHART_MARGIN}>
				<CartesianGrid className="stroke-border" opacity={0.3} strokeDasharray="3 3" />
				<XAxis {...XAXIS_PROPS} tickFormatter={formatTime} />
				<YAxis {...YAXIS_PROPS} />
				<Tooltip contentStyle={TOOLTIP_STYLE} />
				<Bar dataKey="value" fill="hsl(220, 70%, 55%)" radius={BAR_RADIUS} />
			</BarChart>
		</ChartWrapper>
	);
}
