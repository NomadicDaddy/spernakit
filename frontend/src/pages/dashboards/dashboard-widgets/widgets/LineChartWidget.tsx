import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardWidget } from '@/api/dashboards';

import { useChartData } from '@/hooks/dashboards/useChartData';
import { useWidgetData } from '@/hooks/dashboards/useWidgetData';
import { useFormatters } from '@/hooks/useFormatters';
import { CHART_MARGIN, TOOLTIP_STYLE, XAXIS_PROPS, YAXIS_PROPS } from '@/lib/chartConstants';

import { ChartWrapper } from './ChartWrapper';
import { WidgetSkeleton } from './WidgetSkeleton';

export function LineChartWidget({
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

	const color = widget.metricType === 'cpu_usage' ? 'hsl(220, 70%, 55%)' : 'hsl(150, 60%, 45%)';
	const unit =
		widget.metricType === 'cpu_usage' || widget.metricType === 'memory_usage' ? '%' : '';

	return (
		<ChartWrapper data={chartData} title={widget.title}>
			<AreaChart data={chartData} key={`area-chart-${widget.id}`} margin={CHART_MARGIN}>
				<defs>
					<linearGradient id={`wg-${widget.id}`} x1="0" x2="0" y1="0" y2="1">
						<stop offset="5%" stopColor={color} stopOpacity={0.3} />
						<stop offset="95%" stopColor={color} stopOpacity={0} />
					</linearGradient>
				</defs>
				<CartesianGrid className="stroke-border" opacity={0.3} strokeDasharray="3 3" />
				<XAxis {...XAXIS_PROPS} tickFormatter={formatTime} />
				<YAxis
					{...YAXIS_PROPS}
					domain={[0, 100]}
					tickFormatter={(v: number) => `${v}${unit}`}
				/>
				<Tooltip contentStyle={TOOLTIP_STYLE} />
				<Area
					dataKey="value"
					dot={false}
					fill={`url(#wg-${widget.id})`}
					stroke={color}
					strokeWidth={2}
					type="monotone"
				/>
			</AreaChart>
		</ChartWrapper>
	);
}
