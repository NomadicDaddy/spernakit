import { formatTime } from '@/lib/formatters';

export const CHART_MARGIN = { bottom: 0, left: 0, right: 0, top: 5 };

export const TOOLTIP_STYLE = {
	backgroundColor: 'hsl(var(--popover))',
	border: '1px solid hsl(var(--border))',
	borderRadius: '6px',
	fontSize: '12px',
};

export const XAXIS_PROPS = {
	axisLine: false,
	className: 'fill-muted-foreground',
	dataKey: 'timestamp' as const,
	minTickGap: 40,
	tick: { fontSize: 10 },
	tickFormatter: formatTime,
	tickLine: false,
};

export const YAXIS_PROPS = {
	axisLine: false,
	className: 'fill-muted-foreground',
	tick: { fontSize: 10 },
	tickLine: false,
	width: 30,
};
