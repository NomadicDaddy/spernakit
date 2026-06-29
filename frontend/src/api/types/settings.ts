import type { BugReportKind, BugReportStatus } from 'spernakit-shared';

/** Setting entry */
interface Setting {
	description: null | string;
	key: string;
	updatedAt: string;
	value: string;
}

/** Audit log entry */
interface AuditLog {
	action: string;
	createdAt: string;
	details: null | string;
	id: number;
	ipAddress: null | string;
	resource: null | string;
	resourceId: null | number;
	userId: null | number;
	username: null | string;
}

/** System dashboard data */
interface DashboardData {
	auditEvents: number;
	metrics: {
		activeConnections: number;
		cpuUsage: number;
		memoryUsage: number;
		requestCount: number;
	};
	systemHealth: string;
	totalUsers: number;
	unreadNotifications: number;
}

/** Bug report or feature request submitted by a user */
interface BugReport {
	createdAt: string;
	description: string;
	email: null | string;
	id: number;
	kind: BugReportKind;
	metadata: null | Record<string, unknown>;
	status: BugReportStatus;
	title: string;
	updatedAt: string;
	userId: null | number;
}

export type { AuditLog, BugReport, DashboardData, Setting };
