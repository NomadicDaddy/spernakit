import type { HealthAlertSeverity, HealthStatus } from 'spernakit-shared';

import type { DataResponse } from './types';

import { apiClient } from './client';

interface HealthCheck {
	checkType: string;
	details?: Record<string, unknown>;
	durationMs: number;
	status: HealthStatus;
}

interface HealthDetailsResponse {
	checks: HealthCheck[];
	status: HealthStatus;
	timestamp: string;
}

interface HealthHistoryEntry {
	checkType: string;
	createdAt: string;
	details: unknown;
	durationMs: null | number;
	id: number;
	status: HealthStatus;
}

interface HealthAlert {
	acknowledgedAt: null | string;
	acknowledgedBy: null | number;
	checkType: string;
	createdAt: string;
	id: number;
	message: string;
	resolvedAt: null | string;
	severity: HealthAlertSeverity;
}

interface HealthHistoryResponse {
	alerts: HealthAlert[];
	history: HealthHistoryEntry[];
}

interface HealthCheckConfig {
	alertsEnabled: boolean;
	alertThreshold: 'degraded' | 'unhealthy';
	diskSpaceDegradedThreshold: number;
	diskSpaceUnhealthyThreshold: number;
	enabled: Record<string, boolean>;
	logRetentionDays: number;
	memoryHeapDegradedThreshold: number;
	memoryHeapUnhealthyThreshold: number;
}

interface CleanupResponse {
	batches?: number;
	deleted?: number;
	resolved?: number;
}

function getHealthDetails(): Promise<DataResponse<HealthDetailsResponse>> {
	return apiClient.get<DataResponse<HealthDetailsResponse>>('/health/details');
}

function getHealthHistory(): Promise<DataResponse<HealthHistoryResponse>> {
	return apiClient.get<DataResponse<HealthHistoryResponse>>('/health/history');
}

interface WebVitalSummary {
	latest: null | number;
	latestRating: null | string;
	name: string;
	/** 75th percentile over the window — the Core Web Vitals definition. */
	p75: number;
	sampleCount: number;
	threshold: number;
}

function getWebVitalsSummary(hours = 24): Promise<DataResponse<WebVitalSummary[]>> {
	return apiClient.get<DataResponse<WebVitalSummary[]>>('/system/web-vitals', {
		params: { hours: String(hours) },
	});
}

/** A single metrics history data point from the backend */
interface MetricsHistoryEntry {
	cpuUsage: null | number;
	heapTotal: null | number;
	heapUsed: null | number;
	memoryUsage: null | number;
	rss: null | number;
	timestamp: string;
}

/** Response shape from GET /system/metrics */
interface MetricsResponse {
	current: {
		activeConnections: number;
		cpuUsage: number;
		memoryFree: number;
		memoryTotal: number;
		memoryUsage: number;
		requestCount: number;
		timestamp: string;
	};
	history: MetricsHistoryEntry[];
	latest: MetricsHistoryEntry | null;
}

function getMetricsHistory(hours = 24, limit = 100): Promise<DataResponse<MetricsResponse>> {
	return apiClient.get<DataResponse<MetricsResponse>>('/system/metrics', {
		params: { hours: String(hours), limit: String(limit) },
	});
}

function acknowledgeAlert(alertId: number): Promise<DataResponse<HealthAlert>> {
	return apiClient.post<DataResponse<HealthAlert>>(`/health/alerts/${alertId}/acknowledge`);
}

function resolveAlert(alertId: number): Promise<DataResponse<HealthAlert>> {
	return apiClient.post<DataResponse<HealthAlert>>(`/health/alerts/${alertId}/resolve`);
}

function getHealthConfig(): Promise<DataResponse<HealthCheckConfig>> {
	return apiClient.get<DataResponse<HealthCheckConfig>>('/health/config');
}

function updateHealthConfig(
	updates: Partial<HealthCheckConfig>
): Promise<DataResponse<HealthCheckConfig>> {
	return apiClient.put<DataResponse<HealthCheckConfig>>('/health/config', {
		body: updates,
	});
}

function runHealthCheck(checkName: string): Promise<DataResponse<HealthCheck>> {
	return apiClient.post<DataResponse<HealthCheck>>(`/health/checks/${checkName}/run`);
}

function cleanupHealthLogs(): Promise<DataResponse<CleanupResponse>> {
	return apiClient.delete<DataResponse<CleanupResponse>>('/health/logs');
}

function cleanupHealthAlerts(): Promise<DataResponse<CleanupResponse>> {
	return apiClient.post<DataResponse<CleanupResponse>>('/health/alerts/cleanup');
}

export {
	acknowledgeAlert,
	cleanupHealthAlerts,
	cleanupHealthLogs,
	getHealthConfig,
	getHealthDetails,
	getHealthHistory,
	getMetricsHistory,
	getWebVitalsSummary,
	resolveAlert,
	runHealthCheck,
	updateHealthConfig,
};
export type {
	HealthAlert,
	HealthCheck,
	HealthCheckConfig,
	HealthHistoryEntry,
	MetricsResponse,
	WebVitalSummary,
};
