import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useFormatters } from '@/hooks/useFormatters';
import { CHART_MARGIN, CHART_SERIES } from '@/lib/chartConstants';

const TICK_STYLE = { fontSize: 11 };
const ACTIVE_DOT = { r: 4, strokeWidth: 0 };
const CHART_HEIGHT = 200;
const numFmt1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

interface MetricDataPoint {
	timestamp: string;
	value: null | number;
}

interface MetricChartProps {
	/** Color for the area fill and stroke. Pass a `CHART_SERIES` entry, not a literal colour. */
	color?: string;
	/** Chart data points with timestamp and value */
	data: MetricDataPoint[];
	/**
	 * Outline level for the card title. `h3` suits a chart under a `SectionHeader` on a page whose
	 * `PageHeader` owns the `h1`. Pass `h4` where the `SectionHeader` above it is itself nested at
	 * `level="h3"` — /settings/system-health is the case — so the level does not repeat its parent.
	 */
	headingLevel?: 'h3' | 'h4';
	/**
	 * How the series is bounded in time, as a phrase — "over the last 6 hours". It goes into
	 * the chart's accessible name; the caller owns the range, so the caller owns the wording.
	 */
	rangeLabel?: string;
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
		<div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
			<p className="text-xs text-muted-foreground">{formatDateTime(label)}</p>
			<p className="font-medium tabular-nums">
				{numFmt1.format(firstEntry.value)}
				{unit}
			</p>
		</div>
	);
}

function MetricChart({
	color = CHART_SERIES.default,
	data,
	headingLevel = 'h3',
	rangeLabel,
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

	/*
	 * The gradient id must not be derived from `title`. It was `gradient-${title}`, so the chart
	 * titled "Memory Usage" emitted `id="gradient-Memory Usage"` and painted with
	 * `fill="url(#gradient-Memory Usage)"` — a fragment reference containing a space, which no
	 * browser resolves. The paint fell back to black, so the area under the line rendered as a solid
	 * black slab on /dashboard and /settings/system-health rather than the series colour fading out.
	 * `useId` is unique per instance, which a title is not: two charts sharing a title also shared
	 * one gradient element. The colons React puts in the value are stripped because the same string
	 * is written as a raw `id` attribute.
	 */
	const gradientId = `gradient-${useId().replace(/:/g, '')}`;

	/*
	 * Recharts renders a focusable `application` region whose whole accessible text is the
	 * concatenated axis ticks — "09:4709:5209:5710:0210:0710:1210:180%25%50%75%100%". Two charts
	 * side by side produced two indistinguishable focus stops and two identical runs of digits,
	 * with the titles existing only as visual text in the card headers. Hiding the SVG and naming
	 * the wrapper turns each chart into one named image built from props the component already has.
	 */
	const latest = chartData[chartData.length - 1]?.value;
	const chartLabel = [
		title,
		rangeLabel ? ` ${rangeLabel}` : '',
		latest === undefined ? '' : `, currently ${numFmt1.format(latest)}${unit}`,
	].join('');

	return (
		<Card>
			<CardHeader className="pb-2">
				{/*
				 * No local type override. At `text-sm font-medium` a chart card's title computed to
				 * exactly the body font size and was distinguished from body copy by weight alone —
				 * on /settings/system-health that put CPU Usage and Memory Usage a step below the
				 * five card titles around them. `CardTitle`'s own step is the fix; a per-card size
				 * here is how the drift started. StatCard keeps `text-sm font-medium` deliberately:
				 * there the title is a label above a large number, not the card's heading.
				 */}
				<CardTitle as={headingLevel}>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{chartData.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
						No data available
					</div>
				) : (
					<div
						aria-label={chartLabel}
						className="h-[200px] w-full"
						ref={containerRef}
						role="img">
						{containerWidth > 0 && (
							<AreaChart
								accessibilityLayer={false}
								aria-hidden="true"
								data={chartData}
								height={CHART_HEIGHT}
								margin={CHART_MARGIN}
								width={containerWidth}>
								<defs>
									<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
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
									fill={`url(#${gradientId})`}
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
