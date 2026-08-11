import { lazy, Suspense } from 'react';

import type { MetricDataPoint } from '@/components/shared/charts/MetricChart';

import { ChartSkeleton } from '@/components/shared/skeletons/ChartSkeleton';
import { CHART_SERIES } from '@/lib/chartConstants';

const MetricChart = lazy(() =>
	import('@/components/shared/charts/MetricChart').then((m) => ({ default: m.MetricChart })),
);

interface HealthMetricsSectionProps {
	cpuData: MetricDataPoint[];
	memoryData: MetricDataPoint[];
	metricsLoading: boolean;
}

function ChartSuspenseFallback() {
	return (
		<>
			<ChartSkeleton />
			<ChartSkeleton />
		</>
	);
}

function HealthMetricsSection({ cpuData, memoryData, metricsLoading }: HealthMetricsSectionProps) {
	return (
		<>
			{metricsLoading ? (
				<ChartSuspenseFallback />
			) : (
				<Suspense fallback={<ChartSuspenseFallback />}>
					{/*
					 * `h4`, not the default `h3`: the "Resource Usage Trends" SectionHeader above
					 * these two charts is itself nested at `level="h3"` under the tab's own
					 * "System Health" section.
					 */}
					<MetricChart
						color={CHART_SERIES.cpu}
						data={cpuData}
						headingLevel="h4"
						title="CPU Usage"
						unit="%"
						yMax={100}
					/>
					{/*
					 * Not the healthy green: the memory line sits on the same page as the health
					 * badges, and this series tracks OS memory utilization, which no configured
					 * threshold governs. The configured memoryHeap* thresholds are a different
					 * quantity (process heap) and are skipped entirely under Bun, so they cannot
					 * be drawn here as this chart's limits.
					 */}
					<MetricChart
						color={CHART_SERIES.memory}
						data={memoryData}
						headingLevel="h4"
						title="Memory Usage"
						unit="%"
						yMax={100}
					/>
				</Suspense>
			)}
		</>
	);
}

export { HealthMetricsSection };
