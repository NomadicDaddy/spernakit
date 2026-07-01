import type { MetricsResponse } from '@/api/health';
import type { DataResponse } from '@/api/types';

function useChartData(
	metricsData: DataResponse<MetricsResponse> | undefined,
	metricType: string
): { timestamp: string; value: number }[] {
	const history = metricsData?.data.history ?? [];
	return history
		.map((entry) => {
			let value: null | number;
			switch (metricType) {
				case 'cpu_usage':
					value = entry.cpuUsage;
					break;
				case 'memory_usage':
					value = entry.memoryUsage;
					break;
				default:
					value = null;
			}
			return { timestamp: entry.timestamp, value };
		})
		.filter((d): d is { timestamp: string; value: number } => d.value !== null)
		.reverse();
}

export { useChartData };
