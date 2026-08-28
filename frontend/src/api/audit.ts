import type { AuditLog, PaginatedResponse } from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

/** Query parameters for filtering and paginating audit log entries. */
interface ListAuditLogsParams {
	action?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: string;
	/** `failed` for responses of 400 or above, `succeeded` for the rest. */
	outcome?: string;
	page?: string;
	search?: string;
	/** Column to sort by: createdAt, username, action, resource, ipAddress. */
	sortBy?: string;
	/** `asc`, or descending for anything else. */
	sortDir?: string;
	userId?: string;
}

/** Fetch paginated audit logs with optional filters (action, user, date range). Requires ADMIN+ role. */
function listAuditLogs(params?: ListAuditLogsParams): Promise<PaginatedResponse<AuditLog>> {
	const filtered = buildQueryParams(params);
	return apiClient.get<PaginatedResponse<AuditLog>>('/audit-logs', {
		...(filtered ? { params: filtered } : {}),
	});
}

export { listAuditLogs };
