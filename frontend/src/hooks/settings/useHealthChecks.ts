import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { HealthCheckConfig } from '@/api/health';
import type { DataResponse } from '@/api/types';

import {
	cleanupHealthAlerts,
	cleanupHealthLogs,
	getHealthConfig,
	getHealthDetails,
	getHealthHistory,
	getMetricsHistory,
	getWebVitalsSummary,
	runHealthCheck,
	updateHealthConfig,
} from '@/api/health';

function useHealthConfig() {
	const queryClient = useQueryClient();

	const { data: config, isLoading: configLoading } = useQuery({
		queryFn: getHealthConfig,
		queryKey: ['health-config'],
	});

	const updateConfigMutation = useMutation<
		DataResponse<HealthCheckConfig>,
		Error,
		Partial<HealthCheckConfig>,
		{ previous: DataResponse<HealthCheckConfig> | undefined }
	>({
		mutationFn: (updates) => updateHealthConfig(updates),
		onError: (err, _updates, context) => {
			if (context?.previous) {
				queryClient.setQueryData(['health-config'], context.previous);
			}
			toast.error(err.message || 'Failed to update health check configuration');
		},
		onMutate: async (updates) => {
			await queryClient.cancelQueries({ queryKey: ['health-config'] });
			const previous = queryClient.getQueryData<DataResponse<HealthCheckConfig>>([
				'health-config',
			]);
			if (previous) {
				queryClient.setQueryData(['health-config'], {
					...previous,
					data: { ...previous.data, ...updates },
				});
			}
			return { previous };
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-config'] });
		},
	});

	return { config, configLoading, updateConfigMutation };
}

function useHealthDetails() {
	const queryClient = useQueryClient();

	const {
		data: details,
		isLoading: detailsLoading,
		refetch: refetchDetails,
	} = useQuery({
		queryFn: getHealthDetails,
		queryKey: ['health-details'],
	});

	const runCheckMutation = useMutation({
		mutationFn: (checkName: string) => runHealthCheck(checkName),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-details'] });
			void queryClient.invalidateQueries({ queryKey: ['health-history'] });
		},
	});

	return { details, detailsLoading, refetchDetails, runCheckMutation };
}

function useHealthHistory() {
	const queryClient = useQueryClient();

	const { data: historyData, isLoading: historyLoading } = useQuery({
		queryFn: getHealthHistory,
		queryKey: ['health-history'],
	});

	const cleanupLogsMutation = useMutation({
		mutationFn: cleanupHealthLogs,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-history'] });
		},
	});

	const cleanupAlertsMutation = useMutation({
		mutationFn: cleanupHealthAlerts,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-history'] });
		},
	});

	return { cleanupAlertsMutation, cleanupLogsMutation, historyData, historyLoading };
}

function useWebVitals() {
	const { data: vitalsData, isLoading: vitalsLoading } = useQuery({
		queryFn: () => getWebVitalsSummary(24),
		queryKey: ['web-vitals-summary'],
		staleTime: Infinity,
	});

	return { vitalsData, vitalsLoading };
}

/** Canonical query key for metrics history — used by DashboardPage, widgets, and health tab. */
const metricsHistoryKey = (hours: number) => ['metrics-history', hours] as const;

/** Shared hook that fetches metrics history and derives cpu/memory chart data. */
function useMetricsHistory(hours: number, enabled = true) {
	const { data: metricsData, isLoading: metricsLoading } = useQuery({
		enabled,
		placeholderData: keepPreviousData,
		queryFn: () => getMetricsHistory(hours, 100),
		queryKey: metricsHistoryKey(hours),
		refetchOnWindowFocus: true, // Primary updates via WebSocket; focus-triggered refresh as fallback
		staleTime: 30_000,
	});

	const cpuData = (metricsData?.data.history ?? []).map((entry) => ({
		timestamp: entry.timestamp,
		value: entry.cpuUsage,
	}));

	const memoryData = (metricsData?.data.history ?? []).map((entry) => ({
		timestamp: entry.timestamp,
		value: entry.memoryUsage,
	}));

	return { cpuData, memoryData, metricsData, metricsLoading };
}

function useHealthMetrics() {
	const [metricsHours, setMetricsHours] = useState(6);
	const { cpuData, memoryData, metricsLoading } = useMetricsHistory(metricsHours);

	return { cpuData, memoryData, metricsHours, metricsLoading, setMetricsHours };
}

export {
	useHealthConfig,
	useHealthDetails,
	useHealthHistory,
	useHealthMetrics,
	useMetricsHistory,
	useWebVitals,
};
