import {
	Activity,
	AlertTriangle,
	BarChart3,
	Cpu,
	HardDrive,
	Heart,
	Network,
	Users,
	Wifi,
} from 'lucide-react';
import React from 'react';

import type { MetricType } from '@/api/dashboards';

import { formatTime } from '@/lib/formatters';

export { formatTime };

import type { DashboardData } from '@/api/types';

export const NO_WIDGET_DATA_LABEL = 'No data';

export const METRIC_ICON: Record<MetricType, React.ReactNode> = {
	active_connections: <Wifi aria-hidden="true" className="text-muted-foreground size-4" />,
	audit_events: <Activity aria-hidden="true" className="text-muted-foreground size-4" />,
	business_events: <BarChart3 aria-hidden="true" className="text-muted-foreground size-4" />,
	cpu_usage: <Cpu aria-hidden="true" className="text-muted-foreground size-4" />,
	health_checks: <Heart aria-hidden="true" className="text-muted-foreground size-4" />,
	health_status: <Heart aria-hidden="true" className="text-muted-foreground size-4" />,
	memory_usage: <HardDrive aria-hidden="true" className="text-muted-foreground size-4" />,
	request_count: <Network aria-hidden="true" className="text-muted-foreground size-4" />,
	system_alerts: <AlertTriangle aria-hidden="true" className="text-muted-foreground size-4" />,
	total_users: <Users aria-hidden="true" className="text-muted-foreground size-4" />,
};

/* -------------------------------------------------------------------------- */
/*  Metric Value Resolution                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Options for resolving metric values from dashboard data.
 * @property clampTo100 - Clamp numeric values to 0-100 range (for gauges)
 * @property formatWithUnit - Append unit suffix (% for usage metrics)
 */
interface ResolveOptions {
	clampTo100?: boolean;
	formatWithUnit?: boolean;
}

type MetricExtractor = (data: DashboardData) => number | string;

const METRIC_EXTRACTORS: Record<MetricType, MetricExtractor> = {
	active_connections: (d) => d.metrics?.activeConnections ?? 0,
	audit_events: (d) => d.auditEvents ?? 0,
	business_events: () => 0,
	cpu_usage: (d) => d.metrics?.cpuUsage ?? 0,
	health_checks: () => 0,
	health_status: (d) => d.systemHealth ?? 'Unknown',
	memory_usage: (d) => d.metrics?.memoryUsage ?? 0,
	request_count: (d) => d.metrics?.requestCount ?? 0,
	system_alerts: () => 0,
	total_users: (d) => d.totalUsers ?? 0,
};

/**
 * Resolves a metric value from DashboardData based on the metric type.
 * Centralizes the mapping logic used by StatCardWidget and GaugeWidget.
 */
export function resolveMetricValue(
	metricType: MetricType,
	data: DashboardData | undefined,
	options: ResolveOptions = {}
): number | string {
	if (!data?.metrics) {
		return NO_WIDGET_DATA_LABEL;
	}

	const { clampTo100 = false, formatWithUnit = false } = options;

	const extractor = METRIC_EXTRACTORS[metricType];
	const rawValue = extractor(data);

	if (typeof rawValue === 'string') {
		return rawValue;
	}

	const numericValue = clampTo100 ? Math.min(rawValue, 100) : rawValue;

	if (formatWithUnit && (metricType === 'cpu_usage' || metricType === 'memory_usage')) {
		return `${numericValue}%`;
	}

	return numericValue;
}
