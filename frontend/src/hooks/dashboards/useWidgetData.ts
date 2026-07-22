import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { DashboardWidget } from '@/api/dashboards';
import type { DashboardData, DataResponse } from '@/api/types';

import { apiClient } from '@/api/client';
import { useMetricsHistory } from '@/hooks/settings/useHealthChecks';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { parseTimeRangeToHours } from '@/lib/timeRange';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWsStore } from '@/stores/wsStore';

/**
 * Shared query keys for widget data — all widgets intentionally share these caches.
 *
 * DESIGN DECISION: Dashboard widgets fetch their own data rather than receiving it as
 * props from the page layer. This is intentional per SSOC guidelines because widget data
 * is intrinsic to widget function — each widget type requires different data (dashboard
 * stats, metrics history, health status) and widgets can be added/removed dynamically.
 * Hoisting all possible data fetches to the page would create over-fetching for widgets
 * that aren't present and tight coupling between page and widget implementations.
 */
const widgetDataKeys = {
	dashboard: (workspaceId: null | number) => ['widget-shared', 'dashboard', workspaceId] as const,
};

interface UseWidgetDataOptions {
	allowPrivateData?: boolean;
}

export function useWidgetData(
	widget: DashboardWidget,
	{ allowPrivateData = true }: UseWidgetDataOptions = {}
) {
	const queryClient = useQueryClient();
	const subscribe = useWsStore((s) => s.subscribe);
	const unsubscribe = useWsStore((s) => s.unsubscribe);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const canLoadPrivateData = allowPrivateData && isAuthenticated;
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const hours = parseTimeRangeToHours(widget.timeRange);

	const needsMetrics = widget.widgetType === 'line_chart' || widget.widgetType === 'bar_chart';

	useEffect(() => {
		if (!canLoadPrivateData) return;
		function handleWsMessage(message: unknown) {
			const msg = message as { type: string };
			if (msg.type === 'dashboard-update') {
				void queryClient.invalidateQueries({
					queryKey: widgetDataKeys.dashboard(activeWorkspaceId),
				});
				void queryClient.invalidateQueries({ queryKey: ['metrics-history'] });
			}
		}
		subscribe('*', handleWsMessage);
		return () => {
			unsubscribe('*', handleWsMessage);
		};
	}, [canLoadPrivateData, activeWorkspaceId, subscribe, unsubscribe, queryClient]);

	const dashboardQuery = useQuery({
		// Shared dashboards (/dashboards/shared/:token) are viewed by unauthenticated
		// users and must not be filled with an authenticated viewer's private metrics.
		// Widgets render their empty state until scoped data exists.
		enabled: canLoadPrivateData,
		queryFn: async () => {
			const res = await apiClient.get<DataResponse<DashboardData>>('/system/dashboard');
			return res.data;
		},
		queryKey: widgetDataKeys.dashboard(activeWorkspaceId),
		refetchOnWindowFocus: true, // Primary updates via WebSocket; focus-triggered refresh as fallback
		staleTime: STALE_TIME_SHORT,
	});

	const { metricsData: metricsQueryData } = useMetricsHistory(
		hours,
		needsMetrics && canLoadPrivateData
	);

	return {
		dashboardData: dashboardQuery.data,
		isLoading: dashboardQuery.isLoading,
		metricsData: metricsQueryData,
	};
}
