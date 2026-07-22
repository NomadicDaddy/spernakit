import { RefreshCw } from 'lucide-react';

import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';
import { Button } from '@/components/ui/button';
import {
	useHealthConfig,
	useHealthDetails,
	useHealthHistory,
	useHealthMetrics,
	useWebVitals,
} from '@/hooks/settings/useHealthChecks';

import {
	HealthAlertsSection,
	HealthChecksSection,
	HealthCleanupSection,
	HealthConfigSection,
	HealthHistorySection,
	HealthMetricsSection,
	HealthStatusSection,
	HealthTimelineSection,
	HealthVitalsSection,
} from './index';

function SystemHealthTab() {
	const { config, configLoading, updateConfigMutation } = useHealthConfig();
	const { details, detailsLoading, refetchDetails, runCheckMutation } = useHealthDetails();
	const { cleanupAlertsMutation, cleanupLogsMutation, historyData, historyLoading } =
		useHealthHistory();
	const { vitalsData, vitalsLoading } = useWebVitals();
	const { cpuData, memoryData, metricsHours, metricsLoading, setMetricsHours } =
		useHealthMetrics();

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">System Health</h2>
					<p className="text-muted-foreground text-sm">
						Monitor system health checks and alerts.
					</p>
				</div>
				<Button
					onClick={() => {
						void refetchDetails();
					}}
					size="sm"
					variant="outline">
					<RefreshCw aria-hidden="true" className="mr-2 size-4" />
					Refresh
				</Button>
			</div>

			<HealthConfigSection
				config={config?.data}
				configLoading={configLoading}
				updateConfigMutation={updateConfigMutation}
			/>

			<HealthStatusSection details={details?.data} detailsLoading={detailsLoading} />

			<HealthChecksSection
				details={details?.data}
				detailsLoading={detailsLoading}
				runCheckMutation={runCheckMutation}
			/>

			<HealthAlertsSection historyData={historyData?.data} historyLoading={historyLoading} />

			<HealthCleanupSection
				cleanupAlertsMutation={cleanupAlertsMutation}
				cleanupLogsMutation={cleanupLogsMutation}
			/>

			<HealthTimelineSection
				historyData={historyData?.data}
				historyLoading={historyLoading}
			/>

			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium">Resource Usage Trends</h3>
					<p className="text-muted-foreground text-xs">Historical CPU and memory usage</p>
				</div>
				<TimeRangeSelector onChange={setMetricsHours} value={metricsHours} />
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<HealthMetricsSection
					cpuData={cpuData}
					memoryData={memoryData}
					metricsLoading={metricsLoading}
				/>
			</div>

			<HealthHistorySection historyData={historyData?.data} historyLoading={historyLoading} />

			<HealthVitalsSection vitalsData={vitalsData?.data} vitalsLoading={vitalsLoading} />
		</div>
	);
}

export { SystemHealthTab };
