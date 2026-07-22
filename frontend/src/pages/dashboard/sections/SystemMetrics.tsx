import { Cpu, HardDrive, Network, Wifi } from 'lucide-react';

import type { DashboardData } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';

interface SeriesPoint {
	timestamp: string;
	value: null | number;
}

const CPU_COLOR = 'hsl(220, 70%, 55%)';
const MEMORY_COLOR = 'hsl(150, 60%, 45%)';

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
			<div>
				<h2 className="text-lg font-semibold">System Metrics</h2>
				<p className="text-muted-foreground mt-1 text-sm">Real-time resource usage</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{isLoading ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<StatCard
							icon={
								<HardDrive
									aria-hidden="true"
									className="text-muted-foreground size-5"
								/>
							}
							progress={Math.min(data?.metrics.memoryUsage ?? 0, 100)}
							sparkline={
								memorySeries.length > 1
									? { color: MEMORY_COLOR, points: memorySeries }
									: undefined
							}
							title="Memory Usage"
							trend={trendFor(memorySeries, metricsHours)}
							value={`${data?.metrics.memoryUsage ?? 0}%`}
						/>
						<StatCard
							icon={
								<Cpu aria-hidden="true" className="text-muted-foreground size-5" />
							}
							progress={Math.min(data?.metrics.cpuUsage ?? 0, 100)}
							sparkline={
								cpuSeries.length > 1
									? { color: CPU_COLOR, points: cpuSeries }
									: undefined
							}
							title="CPU Usage"
							trend={trendFor(cpuSeries, metricsHours)}
							value={`${data?.metrics.cpuUsage ?? 0}%`}
						/>
						<StatCard
							icon={
								<Network
									aria-hidden="true"
									className="text-muted-foreground size-5"
								/>
							}
							title="Request Count"
							value={data?.metrics.requestCount ?? 0}
						/>
						<StatCard
							icon={
								<Wifi aria-hidden="true" className="text-muted-foreground size-5" />
							}
							title="Active Connections"
							value={data?.metrics.activeConnections ?? 0}
						/>
					</>
				)}
			</div>
		</>
	);
}

export { SystemMetrics };
