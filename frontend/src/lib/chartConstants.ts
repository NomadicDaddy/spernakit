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
 *
 * `--chart-4` is absent for the opposite reason: it is byte-identical to `--muted-foreground` in
 * both themes, which is right for "unknown / no data" and wrong for anything live. Memory pointed
 * at it, so a 66.5% load was drawn in the app's body-text grey next to CPU at 7.6% in blue — the
 * busier of the two series read as the disabled one. Memory now has `--chart-6`, its own
 * chromatic, status-free hue at `--chart-5`'s lightness so the two carry equal weight where they
 * share a chart.
 */
export const CHART_SERIES = {
	/** CPU utilization. */
	cpu: 'var(--chart-5)',
	/** A chart with one unnamed series. Deliberately the same token as `cpu`. */
	default: 'var(--chart-5)',
	/** Memory utilization. */
	memory: 'var(--chart-6)',
} as const;

/**
 * Tick text style for every axis in the app.
 *
 * The colour is in `tick`, not in a `className`. recharts writes a `fill` presentation attribute
 * onto each tick `<text>`, and a `className` handed to `<XAxis>` never lands on that `<text>` — so
 * `fill-muted-foreground` could only offer an inherited fill, which the element's own presentation
 * attribute beats. The class was inert and the labels painted recharts' built-in `#666`, 3.13:1
 * against the card at 11px in dark, where `--muted-foreground` gives 6.91:1.
 *
 * The rule is about reach, not precedence: a class that does land on the painted element wins over
 * a presentation attribute (see `CartesianGrid`'s `stroke-border` in MetricChart). Anything recharts
 * renders as a descendant it does not forward `className` to has to be styled through a prop.
 */
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 10 };

export const XAXIS_PROPS = {
	axisLine: false,
	dataKey: 'timestamp' as const,
	minTickGap: 40,
	tick: AXIS_TICK,
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
	tick: AXIS_TICK,
	tickLine: false,
	width: 40,
};
