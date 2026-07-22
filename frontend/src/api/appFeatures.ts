import { apiClient } from './client';
import { type DataResponse } from './types';

interface AppFeatures {
	analyticsEnabled: boolean;
	bugReportEnabled: boolean;
	dashboardsEnabled: boolean;
	defaultLayoutMode: 'sidebar' | 'topbar';
	filesEnabled: boolean;
	notificationsEnabled: boolean;
	onboardingEnabled: boolean;
	workspacesEnabled: boolean;
}

/** Fetch app-wide feature flags. */
async function getAppFeatures(): Promise<DataResponse<AppFeatures>> {
	return apiClient.get<DataResponse<AppFeatures>>('/settings/app/features');
}

export { getAppFeatures };
export type { AppFeatures };
