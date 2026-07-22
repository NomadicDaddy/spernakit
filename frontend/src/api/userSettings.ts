import { apiClient } from './client';
import { type DataResponse } from './types';

interface UserUiSettings {
	appTheme: string;
	containerWidth: 'centered' | 'full-width';
	dateFormat: string;
	density: 'comfortable' | 'compact' | 'relaxed';
	itemsPerPage: number;
	language: string;
	layoutMode: 'sidebar' | 'topbar';
	sidebarCollapsed: boolean;
	theme: 'dark' | 'light' | 'system';
	timeFormat: string;
	timezone: string;
}

type UpdateUserUiSettingsParams = Partial<UserUiSettings>;

/**
 * Get user UI settings.
 */
async function getUserUiSettings(): Promise<DataResponse<UserUiSettings>> {
	return apiClient.get<DataResponse<UserUiSettings>>('/settings/user');
}

/**
 * Update user UI settings.
 */
async function updateUserUiSettings(
	params: UpdateUserUiSettingsParams
): Promise<DataResponse<UserUiSettings>> {
	return apiClient.put<DataResponse<UserUiSettings>>('/settings/user', {
		body: params,
	});
}

export { getUserUiSettings, updateUserUiSettings };
export type { UserUiSettings };
