import { RefreshCw } from 'lucide-react';

import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Spinner } from '@/components/shared/Spinner';
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
	const { details, detailsFetching, detailsLoading, refetchDetails, runCheckMutation } =
		useHealthDetails();
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
				{/*
				 * The control acknowledges its own press. Clicking Refresh changed nothing about the
				 * button — no disable, no motion, no toast — and the only confirmation was "Last
				 * checked" inside the Overall Status card, ~460px down and ~1350px left of the thing
				 * that was pressed. Four rows below, every CheckCard's Run button swaps its label and
				 * disables while in flight; this is the same treatment, using the app's only spin
				 * primitive rather than introducing new motion.
				 */}
				<Button
					disabled={detailsFetching}
					onClick={() => {
						void refetchDetails();
					}}
					size="sm"
					variant="outline">
					{detailsFetching ? (
						<Spinner size={16} />
					) : (
						<RefreshCw aria-hidden="true" className="size-4" />
					)}
					{detailsFetching ? 'Refreshing…' : 'Refresh'}
				</Button>
			</SectionHeader>

			{/*
			 * Observation before configuration. This surface opened on a 450px form of five numeric
			 * thresholds and six switches, and pushed Overall Status — the one card that answers the
			 * question the page exists to ask — below it: at 1440x900 the first screen ended inside
			 * the threshold inputs and the status answer was entirely below the fold. The status card
			 * is also the shortest thing on the page at 82px, so the surface spent its best space on
			 * its least urgent content.
			 *
			 * The two administrative cards now sit together at the very end rather than immediately
			 * below HealthHistorySection as the finding literally proposed. Cleanup Actions and Health
			 * Check Configuration are the only two mutating sections here; splitting them so one
			 * lands before the vitals charts and one after would have left an operator scrolling past
			 * a form to reach a chart and past a chart to reach a form. Everything above them is
			 * read-only, in the order an operator asks: status, per-check results, alerts, timeline,
			 * resource trends, history, vitals.
			 */}
			<HealthStatusSection details={details?.data} detailsLoading={detailsLoading} />

			<HealthChecksSection
				details={details?.data}
				detailsLoading={detailsLoading}
				runCheckMutation={runCheckMutation}
			/>

			<HealthAlertsSection historyData={historyData?.data} historyLoading={historyLoading} />

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

			{/*
			 * `grid-cols-1` below `md` and `minmax(0,1fr)` at it, for the reason DashboardPage
			 * carries the same pair: an `auto` grid track takes its automatic minimum from its
			 * content's min-content size, and a definite container width does not clamp that.
			 * `1fr` is shorthand for `minmax(auto,1fr)` and has the identical floor.
			 *
			 * Here it also held a ResizeObserver ratchet open. The charts inside are given an
			 * explicit pixel width measured from their own container, so that width becomes the
			 * card's min-content, which became this track's minimum. Narrowing the viewport 390 to
			 * 360 left the track at its 327px wide state and the charts stranded at their 390px
			 * width — `MetricChart`'s own `overflow-hidden` cuts the loop inside the card, but this
			 * track re-opened it one level up.
			 */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
				<HealthMetricsSection
					cpuData={cpuData}
					memoryData={memoryData}
					metricsLoading={metricsLoading}
				/>
			</div>

			<HealthHistorySection historyData={historyData?.data} historyLoading={historyLoading} />

			<HealthVitalsSection vitalsData={vitalsData?.data} vitalsLoading={vitalsLoading} />

			<HealthConfigSection
				config={config?.data}
				configLoading={configLoading}
				updateConfigMutation={updateConfigMutation}
			/>

			<HealthCleanupSection
				cleanupAlertsMutation={cleanupAlertsMutation}
				cleanupLogsMutation={cleanupLogsMutation}
			/>
		</div>
	);
}

export { SystemHealthTab };
