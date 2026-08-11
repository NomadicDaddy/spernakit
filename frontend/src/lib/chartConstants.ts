import { formatTime } from '@/lib/formatters';

export const CHART_MARGIN = { bottom: 0, left: 0, right: 0, top: 5 };

// Theme tokens are OKLCH values, not HSL channel triplets — reference them directly.
// Stock shadcn snippets ship `hsl(var(--token))`; here that produces invalid CSS and the
// declaration is dropped, leaving the tooltip transparent and borderless.
export const TOOLTIP_STYLE = {
	backgroundColor: 'var(--popover)',
	border: '1px solid var(--border)',
	borderRadius: '6px',
	fontSize: '12px',
};

/**
 * Series colours for charts, resolved from the theme's `--chart-*` tokens so a chart line
 * changes with the theme instead of staying a hard-coded hue through both of them.
 *
 * Only the status-free tokens appear here. `--chart-1` (green), `--chart-2` (amber) and
 * `--chart-3` (red) are the hues the health badges use for healthy / degraded / unhealthy, so a
 * utilization series drawn in one of them asserts a status it has no way to know. The memory
 * series was a hard-coded healthy green on /settings/system-health, which painted the line healthy
 * while it tracked 75-95%.
 */
export const CHART_SERIES = {
	/** CPU utilization. */
	cpu: 'var(--chart-5)',
	/** A chart with one unnamed series. Deliberately the same token as `cpu`. */
	default: 'var(--chart-5)',
	/** Memory utilization. */
	memory: 'var(--chart-4)',
} as const;

export const XAXIS_PROPS = {
	axisLine: false,
	className: 'fill-muted-foreground',
	dataKey: 'timestamp' as const,
	minTickGap: 40,
	tick: { fontSize: 10 },
	tickFormatter: formatTime,
	tickLine: false,
};

/**
 * `width: 40` is the same axis gutter `MetricChart` reserves, and it is the narrowest one that
 * fits the widest tick these charts produce. At 30 a percentage axis clipped its top label to
 * `00%` — the leading digit of `100%` was simply cut off at the plot's left edge, so a chart
 * topping out at 100% appeared to top out at zero.
 */
export const YAXIS_PROPS = {
	axisLine: false,
	className: 'fill-muted-foreground',
	tick: { fontSize: 10 },
	tickLine: false,
	width: 40,
};
