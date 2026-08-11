import { Cpu, HardDrive } from 'lucide-react';

import type { DashboardData } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';
import { CHART_SERIES } from '@/lib/chartConstants';

interface SeriesPoint {
	timestamp: string;
	value: null | number;
}

/** Reverse a newest-first series to oldest→newest and drop null gaps. */
function toSeries(points: SeriesPoint[]): number[] {
	const out: number[] = [];
	for (let i = points.length - 1; i >= 0; i--) {
		const v = points[i]?.value;
		if (v !== null && v !== undefined) out.push(v);
	}
	return out;
}

/** Percentage change from the first to the last point of a series, rounded. */
function computeTrendValue(series: number[]): number {
	const first = series[0];
	const last = series[series.length - 1];
	if (first === undefined || last === undefined || first === 0) return 0;
	return Math.round(((last - first) / first) * 100);
}

function trendFor(series: number[], hours: number) {
	if (series.length < 2) return undefined;
	// CPU/memory are utilization metrics: rising usage is the worse signal.
	return { higherIsBetter: false, label: `vs ${hours}h ago`, value: computeTrendValue(series) };
}

function SystemMetrics({
	cpuData = [],
	data,
	isLoading,
	memoryData = [],
	metricsHours = 6,
}: {
	cpuData?: SeriesPoint[];
	data: DashboardData | undefined;
	isLoading: boolean;
	memoryData?: SeriesPoint[];
	metricsHours?: number;
}) {
	const cpuSeries = toSeries(cpuData);
	const memorySeries = toSeries(memoryData);

	return (
		<>
			{/*
			 * The shared section rung. This was a hand-written `text-lg font-semibold`, which
			 * computes to 18px — the h3 step — against 16px card titles below it and 14px stat
			 * titles below those, so a section boundary and a card boundary looked nearly the
			 * same. `SectionHeader` is the primitive that owns this rung.
			 */}
			<SectionHeader description="Real-time resource usage" title="System Metrics" />

			{/*
			 * Two cards, two columns. Request Count and Active Connections moved to the Overview
			 * grid, so everything left here carries a trend, a sparkline and a progress bar and
			 * the row has one content shape.
			 */}
			<div className="grid gap-4 md:grid-cols-2">
				{isLoading ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<StatCard
							icon={
								<HardDrive
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							}
							progress={Math.min(data?.metrics.memoryUsage ?? 0, 100)}
							sparkline={
								memorySeries.length > 1
									? { color: CHART_SERIES.memory, points: memorySeries }
									: undefined
							}
							title="Memory Usage"
							trend={trendFor(memorySeries, metricsHours)}
							value={`${data?.metrics.memoryUsage ?? 0}%`}
						/>
						<StatCard
							icon={
								<Cpu aria-hidden="true" className="size-5 text-muted-foreground" />
							}
							progress={Math.min(data?.metrics.cpuUsage ?? 0, 100)}
							sparkline={
								cpuSeries.length > 1
									? { color: CHART_SERIES.cpu, points: cpuSeries }
									: undefined
							}
							title="CPU Usage"
							trend={trendFor(cpuSeries, metricsHours)}
							value={`${data?.metrics.cpuUsage ?? 0}%`}
						/>
					</>
				)}
			</div>
		</>
	);
}

export { SystemMetrics };
