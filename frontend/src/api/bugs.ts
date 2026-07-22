import type { BugReport as BugReportInput } from '@/lib/bugReport';

import type { BugReport, DataResponse, PaginatedResponse } from './types';

import { apiClient } from './client';

/** Fetch bug reports with pagination. Requires ADMIN+ role. */
function listBugs(page = 1, limit = 200): Promise<PaginatedResponse<BugReport>> {
	return apiClient.get<PaginatedResponse<BugReport>>(`/bugs?page=${page}&limit=${limit}`);
}

/** Submit a bug report. */
function submitBug(report: BugReportInput): Promise<DataResponse<BugReport>> {
	return apiClient.post<DataResponse<BugReport>>('/bugs', { body: report });
}

export { listBugs, submitBug };
