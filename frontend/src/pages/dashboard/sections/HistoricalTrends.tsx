import { lazy, Suspense } from 'react';

import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ChartSkeleton } from '@/components/shared/skeletons/ChartSkeleton';
import { CHART_SERIES } from '@/lib/chartConstants';

const MetricChart = lazy(() =>
	import('@/components/shared/charts/MetricChart').then((m) => ({ default: m.MetricChart })),
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
	/* The section owns the range, so it owns the phrase that names it inside each chart. */
	const rangeLabel = `over the last ${metricsHours} ${metricsHours === 1 ? 'hour' : 'hours'}`;

	return (
		/* A `<section>` at 12px inside the page's 24px stack — see MetricsSummary. */
		<section className="space-y-3">
			{/* The shared section rung, with the range picker in its trailing slot. */}
			<SectionHeader description="Resource usage over time" title="Historical Trends">
				<TimeRangeSelector onChange={onMetricsHoursChange} value={metricsHours} />
			</SectionHeader>

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
							color={CHART_SERIES.cpu}
							data={cpuData}
							rangeLabel={rangeLabel}
							title="CPU Usage"
							unit="%"
							yMax={100}
						/>
						<MetricChart
							color={CHART_SERIES.memory}
							data={memoryData}
							rangeLabel={rangeLabel}
							title="Memory Usage"
							unit="%"
							yMax={100}
						/>
					</Suspense>
				)}
			</div>
		</section>
	);
}

export { HistoricalTrends };
