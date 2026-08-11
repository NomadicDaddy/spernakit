import { RefreshCw } from 'lucide-react';

import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';
import { SectionHeader } from '@/components/shared/SectionHeader';
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
			<SectionHeader
				description="Monitor system health checks and alerts."
				title="System Health">
				<Button
					onClick={() => {
						void refetchDetails();
					}}
					size="sm"
					variant="outline">
					<RefreshCw aria-hidden="true" className="size-4" />
					Refresh
				</Button>
			</SectionHeader>

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

			<SectionHeader
				description="Historical CPU and memory usage"
				level="h3"
				title="Resource Usage Trends">
				<TimeRangeSelector onChange={setMetricsHours} value={metricsHours} />
			</SectionHeader>

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
