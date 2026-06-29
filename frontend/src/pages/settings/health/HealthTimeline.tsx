import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import type { HealthHistoryEntry } from '@/api/health';

import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useFormatters } from '@/hooks/useFormatters';
import { CHART_MARGIN } from '@/lib/chartConstants';

const CHART_HEIGHT = 80;
const TICK_STYLE = { fontSize: 10 };
const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0];
const Y_DOMAIN: [number, number] = [0, 1];

const STATUS_COLORS: Record<string, string> = {
	degraded: 'var(--chart-2)',
	healthy: 'var(--chart-1)',
	pass: 'var(--chart-1)',
	unhealthy: 'var(--chart-3)',
	warn: 'var(--chart-2)',
};

interface HealthTimelinePoint {
	fill: string;
	status: string;
	timestamp: string;
	value: number;
}

interface TimelineTooltipProps {
	active?: boolean;
	payload?: { payload: HealthTimelinePoint }[];
}

function TimelineTooltip({ active, payload }: TimelineTooltipProps) {
	const entry = payload?.[0]?.payload;
	if (!active || !entry) return null;

	return (
		<div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-sm shadow-md">
			<p className="text-muted-foreground text-xs">{entry.timestamp}</p>
			<p className="font-medium capitalize">{entry.status}</p>
		</div>
	);
}

const TIMELINE_TOOLTIP = <TimelineTooltip />;

interface HealthTimelineProps {
	history: HealthHistoryEntry[];
}

export function HealthTimeline({ history }: HealthTimelineProps) {
	const { formatTime } = useFormatters();
	const timelineEntries = [...history].reverse().map((entry) => ({
		fill: STATUS_COLORS[entry.status] ?? 'var(--chart-4)',
		status: entry.status,
		timestamp: formatTime(entry.createdAt),
		value: 1,
	}));
	const [containerRef, containerWidth] = useContainerWidth();

	if (timelineEntries.length === 0) {
		return (
			<div className="text-muted-foreground flex h-[80px] items-center justify-center text-sm">
				No history data
			</div>
		);
	}

	return (
		<div className="h-[80px] w-full" ref={containerRef}>
			{containerWidth > 0 && (
				<BarChart
					data={timelineEntries}
					height={CHART_HEIGHT}
					margin={CHART_MARGIN}
					width={containerWidth}>
					<CartesianGrid
						className="stroke-border"
						opacity={0.3}
						strokeDasharray="3 3"
						vertical={false}
					/>
					<XAxis
						axisLine={false}
						className="fill-muted-foreground"
						dataKey="timestamp"
						minTickGap={40}
						tick={TICK_STYLE}
						tickLine={false}
					/>
					<YAxis domain={Y_DOMAIN} hide />
					<Tooltip content={TIMELINE_TOOLTIP} />
					<Bar dataKey="value" radius={BAR_RADIUS} />
				</BarChart>
			)}
		</div>
	);
}
