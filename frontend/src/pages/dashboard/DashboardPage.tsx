import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';

import type { DashboardData, DataResponse } from '@/api/types';

import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { useMetricsHistory } from '@/hooks/settings/useHealthChecks';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWsStore } from '@/stores/wsStore';

import { ActiveAlerts } from './sections/ActiveAlerts';
import { HistoricalTrends } from './sections/HistoricalTrends';
import { MetricsSummary } from './sections/MetricsSummary';
import { RecentActivity } from './sections/RecentActivity';
import { SystemMetrics } from './sections/SystemMetrics';

/** WebSocket message structure for dashboard updates (excludes user-specific fields). */
interface WsDashboardUpdatePayload {
	auditEvents: number;
	metrics: {
		activeConnections: number;
		cpuUsage: number;
		memoryUsage: number;
		requestCount: number;
	};
	systemHealth: string;
	totalUsers: number;
}

interface WsDashboardMessage {
	data: WsDashboardUpdatePayload;
	type: string;
}

const DASHBOARD_METRICS_HOURS = new Set([1, 6, 12, 24]);
const DEFAULT_METRICS_HOURS = 6;

/**
 * Custom hook for dashboard data with WebSocket real-time updates.
 * Fetches initial data via HTTP and receives updates via WebSocket.
 */
function useDashboardData(enabled: boolean, canUseGlobalScope: boolean) {
	const queryClient = useQueryClient();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const subscribe = useWsStore((s) => s.subscribe);
	const unsubscribe = useWsStore((s) => s.unsubscribe);
	const hasDashboardScope = canUseGlobalScope || activeWorkspaceId !== null;

	useEffect(() => {
		if (!enabled) return;

		function handleWsMessage(message: unknown) {
			const wsMessage = message as WsDashboardMessage;
			if (wsMessage.type === 'dashboard-update' && wsMessage.data) {
				queryClient.setQueryData<DashboardData>(
					['system-dashboard', activeWorkspaceId],
					(oldData) => {
						if (!oldData) {
							return { ...wsMessage.data, unreadNotifications: 0 };
						}
						return {
							...oldData,
							...wsMessage.data,
						};
					}
				);
				void queryClient.invalidateQueries({ queryKey: ['metrics-history'] });
			}
		}

		subscribe('*', handleWsMessage);
		return () => {
			unsubscribe('*', handleWsMessage);
		};
	}, [enabled, activeWorkspaceId, subscribe, unsubscribe, queryClient]);

	return useQuery({
		enabled: enabled && hasDashboardScope,
		queryFn: async () => {
			const res = await apiClient.get<DataResponse<DashboardData>>('/system/dashboard');
			return res.data;
		},
		queryKey: ['system-dashboard', activeWorkspaceId],
		staleTime: Infinity,
		throwOnError: false,
	});
}

function DashboardPage() {
	const { hasMinRole, isSysop } = useAuthorization();
	const hasAccess = hasMinRole('OPERATOR');
	const isAdmin = hasMinRole('ADMIN');
	const canUseGlobalScope = isSysop();
	const { data, isError, isLoading } = useDashboardData(hasAccess, canUseGlobalScope);
	const { getFilter, setFilters } = useUrlFilters();
	const metricsHoursParam = Number(getFilter('metricsHours', String(DEFAULT_METRICS_HOURS)));
	const metricsHours = DASHBOARD_METRICS_HOURS.has(metricsHoursParam)
		? metricsHoursParam
		: DEFAULT_METRICS_HOURS;
	const handleMetricsHoursChange = (hours: number) => {
		setFilters(
			(params) => {
				if (hours === DEFAULT_METRICS_HOURS) {
					params.delete('metricsHours');
				} else {
					params.set('metricsHours', String(hours));
				}
			},
			{ replace: false }
		);
	};
	const { cpuData, memoryData, metricsLoading } = useMetricsHistory(metricsHours, hasAccess);

	if (!hasAccess) {
		return (
			<div className="space-y-6 p-6">
				<PageHeader description="Overview of your application" title="Dashboard" />
				<EmptyState
					description="Dashboard metrics require elevated permissions. Contact an administrator for access."
					icon={ShieldAlert}
					title="Elevated access required"
				/>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6">
			<PageHeader description="Overview of your application" title="Dashboard" />

			{isError && !data ? (
				<EmptyState
					description="Dashboard metrics require elevated permissions. Contact an administrator for access."
					icon={ShieldAlert}
					title="Elevated access required"
				/>
			) : (
				<>
					<MetricsSummary data={data} isLoading={isLoading} />
					<SystemMetrics
						cpuData={cpuData}
						data={data}
						isLoading={isLoading}
						memoryData={memoryData}
						metricsHours={metricsHours}
					/>
					<HistoricalTrends
						cpuData={cpuData}
						memoryData={memoryData}
						metricsHours={metricsHours}
						metricsLoading={metricsLoading}
						onMetricsHoursChange={handleMetricsHoursChange}
					/>
					{isAdmin && (
						<div className="grid gap-4 lg:grid-cols-3">
							<RecentActivity
								canUseGlobalScope={canUseGlobalScope}
								className="lg:col-span-2"
							/>
							<ActiveAlerts />
						</div>
					)}
				</>
			)}
		</div>
	);
}

export { DashboardPage };
