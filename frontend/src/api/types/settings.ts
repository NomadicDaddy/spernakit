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
	/**
	 * A JSON column, so this arrives already parsed — an object, not the string this was declared
	 * as. `auditService.ts` types it `unknown` for the same reason. The old declaration survived
	 * only because every reader wrapped it in `JSON.stringify`; the first one that rendered it
	 * directly crashed the surface, because an object is not a valid React child.
	 */
	details: unknown;
	id: number;
	/** The real operator when the row was written during a SYSOP impersonation session; null otherwise. */
	impersonatedBy: null | number;
	impersonatorUsername: null | string;
	ipAddress: null | string;
	resource: null | string;
	resourceId: null | number;
	/** The response status when the request failed; null when it succeeded. */
	status: null | number;
	/** The username the request body carried, which is the attempted account on a failed sign-in. */
	submittedUsername: null | string;
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
	/** The later report that replaces this one, or null when nothing has replaced it. */
	supersededById: null | number;
	/**
	 * The earlier reports this one was filed as a correction of. Empty for most reports.
	 *
	 * Plural because one correction can replace two reports of the same thing, which is how a
	 * duplicate pair gets merged.
	 */
	supersedesIds: number[];
	title: string;
	updatedAt: string;
	userId: null | number;
}

export type { AuditLog, BugReport, DashboardData, Setting };
