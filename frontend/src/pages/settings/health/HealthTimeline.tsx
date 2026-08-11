import type { HealthHistoryEntry } from '@/api/health';

import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
	degraded: 'var(--chart-2)',
	healthy: 'var(--chart-1)',
	pass: 'var(--chart-1)',
	unhealthy: 'var(--chart-3)',
	warn: 'var(--chart-2)',
};

/** The statuses the strip should shout about. Everything else is background. */
const NOTABLE = new Set(['degraded', 'unhealthy', 'warn']);

interface HealthTimelineProps {
	history: HealthHistoryEntry[];
}

/**
 * A status strip — one segment per check, oldest at the left.
 *
 * This was a recharts `BarChart` in which bar height carried no information: every datum was
 * hard-coded to `value: 1` against a hidden Y axis pinned to `[0, 1]`, so all 73 bars measured
 * exactly 12x45px, and a `CartesianGrid` drew 27 dashed rules across a plot where nothing varied
 * vertically. The visible result was an 80px-tall wall of fully saturated `--chart-1` — the largest
 * and loudest element on the surface — encoding one bit per bar.
 *
 * The tokens stay; the chart machinery does not. Healthy segments sit back at reduced opacity and
 * anything degraded or worse renders at full strength, so an anomaly reads at a glance instead of
 * drowning in an even field of green.
 */
export function HealthTimeline({ history }: HealthTimelineProps) {
	const { formatDateTime } = useFormatters();

	if (history.length === 0) {
		return (
			<div className="flex h-8 items-center text-sm text-muted-foreground">
				No history data
			</div>
		);
	}

	const entries = [...history].reverse();
	const notableCount = entries.filter((entry) => NOTABLE.has(entry.status)).length;
	const first = entries[0];
	const last = entries[entries.length - 1];

	return (
		<div className="space-y-2">
			<div
				aria-label={`${entries.length} health checks, ${notableCount} not healthy`}
				className="flex h-8 items-stretch gap-px overflow-hidden rounded-sm"
				role="img">
				{entries.map((entry) => (
					<div
						className={cn(
							'min-w-0.5 flex-1 rounded-sm',
							NOTABLE.has(entry.status) ? 'opacity-100' : 'opacity-45',
						)}
						key={entry.id}
						style={{ backgroundColor: STATUS_COLORS[entry.status] ?? 'var(--chart-4)' }}
						title={`${formatDateTime(entry.createdAt)} — ${entry.status}`}
					/>
				))}
			</div>
			{/*
			 * The axis this replaces was labelled with time only, so a series crossing midnight read
			 * as running backwards: `23:38` was followed by `09:46`. Two dated endpoints state the
			 * span without pretending the strip is a scale.
			 */}
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>{first && formatDateTime(first.createdAt)}</span>
				<span>{last && formatDateTime(last.createdAt)}</span>
			</div>
		</div>
	);
}
