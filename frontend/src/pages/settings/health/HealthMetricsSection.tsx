import { Suspense, lazy } from 'react';

import type { MetricDataPoint } from '@/components/shared/charts/MetricChart';

import { ChartSkeleton } from '@/components/shared/skeletons/ChartSkeleton';

const MetricChart = lazy(() =>
	import('@/components/shared/charts/MetricChart').then((m) => ({ default: m.MetricChart }))
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
		</>
	);
}

export { HealthMetricsSection };
