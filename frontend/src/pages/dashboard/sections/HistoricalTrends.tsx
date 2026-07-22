import { Suspense, lazy } from 'react';

import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';
import { ChartSkeleton } from '@/components/shared/skeletons/ChartSkeleton';

const MetricChart = lazy(() =>
	import('@/components/shared/charts/MetricChart').then((m) => ({ default: m.MetricChart }))
);

interface ChartDataPoint {
	timestamp: string;
	value: null | number;
}

function HistoricalTrends({
	cpuData,
	memoryData,
	metricsHours,
	metricsLoading,
	onMetricsHoursChange,
}: {
	cpuData: ChartDataPoint[];
	memoryData: ChartDataPoint[];
	metricsHours: number;
	metricsLoading: boolean;
	onMetricsHoursChange: (hours: number) => void;
}) {
	return (
		<>
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">Historical Trends</h2>
					<p className="text-muted-foreground mt-1 text-sm">Resource usage over time</p>
				</div>
				<TimeRangeSelector onChange={onMetricsHoursChange} value={metricsHours} />
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				{metricsLoading ? (
					<>
						<ChartSkeleton />
						<ChartSkeleton />
					</>
				) : (
					<Suspense
						fallback={
							<>
								<ChartSkeleton />
								<ChartSkeleton />
							</>
						}>
						<MetricChart
							color="hsl(220, 70%, 55%)"
							data={cpuData}
							title="CPU Usage"
							unit="%"
							yMax={100}
						/>
						<MetricChart
							color="hsl(150, 60%, 45%)"
							data={memoryData}
							title="Memory Usage"
							unit="%"
							yMax={100}
						/>
					</Suspense>
				)}
			</div>
		</>
	);
}

export { HistoricalTrends };
