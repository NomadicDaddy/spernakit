import type { BugReport as BugReportInput } from '@/lib/bugReport';

import type { BugReport, DataResponse, PaginatedResponse } from './types';

import { apiClient } from './client';

/** Triage filters for {@link listBugs}. An omitted field is not constrained. */
interface ListBugsFilters {
	kind?: BugReport['kind'] | undefined;
	/** Free-text substring match over the report description. */
	search?: string | undefined;
	status?: BugReport['status'] | undefined;
}

/**
 * Fetch bug reports with pagination and optional triage filters. Requires ADMIN+ role.
 *
 * The filters go to the server rather than being applied to the returned page: the list is
 * paginated, so filtering client-side would narrow one page of twenty and leave the total
 * counting the whole inbox.
 */
function listBugs(
	page = 1,
	limit = 200,
	filters: ListBugsFilters = {},
): Promise<PaginatedResponse<BugReport>> {
	const params = new URLSearchParams({ limit: String(limit), page: String(page) });
	if (filters.status) params.set('status', filters.status);
	if (filters.kind) params.set('kind', filters.kind);
	if (filters.search) params.set('search', filters.search);
	return apiClient.get<PaginatedResponse<BugReport>>(`/bugs?${params.toString()}`);
}

/** Submit a bug report. */
function submitBug(report: BugReportInput): Promise<DataResponse<BugReport>> {
	return apiClient.post<DataResponse<BugReport>>('/bugs', { body: report });
}

/** Move a bug report to a new triage status. Requires ADMIN+ role. */
function updateBugStatus(
	id: number,
	status: BugReport['status'],
): Promise<DataResponse<BugReport>> {
	return apiClient.patch<DataResponse<BugReport>>(`/bugs/${id}`, { body: { status } });
}

export { listBugs, submitBug, updateBugStatus };
export type { ListBugsFilters };
