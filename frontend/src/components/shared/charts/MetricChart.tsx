import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useFormatters } from '@/hooks/useFormatters';
import { CHART_MARGIN } from '@/lib/chartConstants';

const TICK_STYLE = { fontSize: 11 };
const ACTIVE_DOT = { r: 4, strokeWidth: 0 };
const CHART_HEIGHT = 200;
const numFmt1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

interface MetricDataPoint {
	timestamp: string;
	value: null | number;
}

interface MetricChartProps {
	/** Color for the area fill and stroke (CSS color string) */
	color?: string;
	/** Chart data points with timestamp and value */
	data: MetricDataPoint[];
	/** Chart title displayed in the card header */
	title: string;
	/** Unit label for the Y-axis and tooltip (e.g., '%', 'MB') */
	unit?: string;
	/** Y-axis domain maximum (defaults to auto) */
	yMax?: number;
}

interface CustomTooltipProps {
	active?: boolean;
	formatDateTime: (ts: string) => string;
	label?: string;
	payload?: { value: number }[];
	unit?: string;
}

function CustomTooltip({ active, formatDateTime, label, payload, unit }: CustomTooltipProps) {
	const firstEntry = payload?.[0];
	if (!active || !firstEntry || !label) return null;

	return (
		<div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-sm shadow-md">
			<p className="text-muted-foreground text-xs">{formatDateTime(label)}</p>
			<p className="font-medium tabular-nums">
				{numFmt1.format(firstEntry.value)}
				{unit}
			</p>
		</div>
	);
}

function MetricChart({
	color = 'hsl(220, 70%, 55%)',
	data,
	title,
	unit = '',
	yMax,
}: MetricChartProps) {
	const chartData: { timestamp: string; value: number }[] = [];
	for (let i = data.length - 1; i >= 0; i--) {
		const d = data[i];
		if (d && d.value !== null) {
			chartData.push({ timestamp: d.timestamp, value: d.value });
		}
	}

	const { formatDateTime, formatTime } = useFormatters();
	const domain: ['auto' | number, 'auto' | number] = [0, yMax ?? 'auto'];
	const tickFormatter = (v: number) => `${v}${unit}`;
	const [containerRef, containerWidth] = useContainerWidth();

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{chartData.length === 0 ? (
					<div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
						No data available
					</div>
				) : (
					<div className="h-[200px] w-full" ref={containerRef}>
						{containerWidth > 0 && (
							<AreaChart
								data={chartData}
								height={CHART_HEIGHT}
								margin={CHART_MARGIN}
								width={containerWidth}>
								<defs>
									<linearGradient
										id={`gradient-${title}`}
										x1="0"
										x2="0"
										y1="0"
										y2="1">
										<stop offset="5%" stopColor={color} stopOpacity={0.3} />
										<stop offset="95%" stopColor={color} stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid
									className="stroke-border"
									opacity={0.3}
									strokeDasharray="3 3"
								/>
								<XAxis
									axisLine={false}
									className="fill-muted-foreground"
									dataKey="timestamp"
									minTickGap={40}
									tick={TICK_STYLE}
									tickFormatter={formatTime}
									tickLine={false}
								/>
								<YAxis
									axisLine={false}
									className="fill-muted-foreground"
									domain={domain}
									tick={TICK_STYLE}
									tickFormatter={tickFormatter}
									tickLine={false}
									width={40}
								/>
								<Tooltip
									content={
										<CustomTooltip
											formatDateTime={formatDateTime}
											unit={unit}
										/>
									}
								/>
								<Area
									activeDot={ACTIVE_DOT}
									dataKey="value"
									dot={false}
									fill={`url(#gradient-${title})`}
									stroke={color}
									strokeWidth={2}
									type="monotone"
								/>
							</AreaChart>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { MetricChart };
export type { MetricChartProps, MetricDataPoint };
