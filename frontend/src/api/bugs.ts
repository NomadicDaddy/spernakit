import type { BugReport as BugReportInput } from '@/lib/bugReport';

import type { BugReport, DataResponse, PaginatedResponse } from './types';

import { apiClient } from './client';

/** Triage filters for {@link listBugs}. An omitted field is not constrained. */
interface ListBugsFilters {
	/**
	 * Include reports another report has replaced. Off by default, matching the server: a
	 * superseded report is not separate open work, and showing it as such is what the link exists
	 * to stop.
	 */
	includeSuperseded?: boolean | undefined;
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
 *
 * The default limit is the server's ceiling. Asking for more used to be accepted and then silently
 * clamped to this same number, so a caller that trusted the request got a short page and no signal.
 */
function listBugs(
	page = 1,
	limit = 100,
	filters: ListBugsFilters = {},
): Promise<PaginatedResponse<BugReport>> {
	const params = new URLSearchParams({ limit: String(limit), page: String(page) });
	if (filters.status) params.set('status', filters.status);
	if (filters.kind) params.set('kind', filters.kind);
	if (filters.search) params.set('search', filters.search);
	if (filters.includeSuperseded) params.set('includeSuperseded', 'true');
	return apiClient.get<PaginatedResponse<BugReport>>(`/bugs?${params.toString()}`);
}

/**
 * Fetch one report by id. Requires ADMIN+ role.
 *
 * The default listing leaves a superseded report out, so following the link from the report that
 * replaced it cannot be answered from the page already loaded. This is how the detail view reaches
 * a report on the other end of the relationship whether or not the list is currently showing it.
 */
function getBug(id: number): Promise<DataResponse<BugReport>> {
	return apiClient.get<DataResponse<BugReport>>(`/bugs/${id}`);
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

/**
 * Record that a later report replaces this one, or clear the link with a null reportId.
 *
 * Available to the reporter for their own report as well as to an ADMIN, because correcting your
 * own mistake is the ordinary case this addresses. Nothing is deleted: the superseded report keeps
 * its text and simply stops appearing as separate open work in the default listing.
 */
function supersedeBug(id: number, reportId: null | number): Promise<DataResponse<BugReport>> {
	return apiClient.put<DataResponse<BugReport>>(`/bugs/${id}/superseded-by`, {
		body: { reportId },
	});
}

export { getBug, listBugs, submitBug, supersedeBug, updateBugStatus };
export type { ListBugsFilters };
