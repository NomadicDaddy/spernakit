import type { AuditLog, PaginatedResponse } from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

/** Query parameters for filtering and paginating audit log entries. */
interface ListAuditLogsParams {
	action?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: string;
	page?: string;
	search?: string;
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
