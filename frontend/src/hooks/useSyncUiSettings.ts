import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { AppTheme } from '@/lib/themes';
import type { ContainerWidth, Density, LayoutMode } from '@/stores/layoutStore';
import type { ThemeMode } from '@/stores/themeStore';

import { getUserUiSettings, type UserUiSettings } from '@/api/userSettings';
import { useAuthStore } from '@/stores/authStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useThemeStore } from '@/stores/themeStore';

interface UiSettingsSetters {
	setAppTheme: (theme: AppTheme) => void;
	setContainerWidth: (width: ContainerWidth) => void;
	setDensity: (density: Density) => void;
	setLayoutMode: (mode: LayoutMode) => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	setThemeMode: (mode: ThemeMode) => void;
}

/**
 * Apply UI settings from the backend to the corresponding frontend stores.
 *
 * @param userOverridden - When true, marks layout mode as user-overridden
 *   (uses `setLayoutMode`). When false, applies layout mode without marking it
 *   as overridden (uses `setLayoutModeFromSync`). PreferencesTab passes true
 *   because the user is explicitly choosing a layout; the boot-time sync passes
 *   false so that super-theme defaults can still take effect later.
 */
function syncUiSettingsToStores(settings: UserUiSettings, setters: UiSettingsSetters): void {
	if (settings.theme !== undefined) setters.setThemeMode(settings.theme);
	if (settings.appTheme !== undefined) setters.setAppTheme(settings.appTheme as AppTheme);
	if (settings.layoutMode !== undefined) setters.setLayoutMode(settings.layoutMode);
	if (settings.containerWidth !== undefined) setters.setContainerWidth(settings.containerWidth);
	if (settings.density !== undefined) setters.setDensity(settings.density);
	if (settings.sidebarCollapsed !== undefined)
		setters.setSidebarCollapsed(settings.sidebarCollapsed);
}

/**
 * Sync backend UI settings to frontend stores on initial page load.
 * This ensures DB settings take precedence over localStorage before user visits Preferences.
 */
function useSyncUiSettings() {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

	const setThemeMode = useThemeStore((s) => s.setMode);
	const setAppTheme = useThemeStore((s) => s.setAppTheme);
	const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed);
	const setLayoutMode = useLayoutStore((s) => s.setLayoutModeFromSync);
	const setContainerWidth = useLayoutStore((s) => s.setContainerWidth);
	const setDensity = useLayoutStore((s) => s.setDensity);

	const {
		data: uiSettings,
		dataUpdatedAt,
		isLoading,
	} = useQuery({
		enabled: isAuthenticated,
		queryFn: getUserUiSettings,
		queryKey: ['user-ui-settings'],
		select: (response) => response.data,
		throwOnError: false,
	});

	useEffect(() => {
		if (isAuthenticated && uiSettings) {
			syncUiSettingsToStores(uiSettings, {
				setAppTheme,
				setContainerWidth,
				setDensity,
				setLayoutMode,
				setSidebarCollapsed,
				setThemeMode,
			});
		}
		// Depend on dataUpdatedAt (primitive) instead of uiSettings (object) to avoid
		// re-running when refetch returns structurally identical data.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isAuthenticated, dataUpdatedAt]);

	return { isLoading };
}

export { syncUiSettingsToStores, useSyncUiSettings };
export type { UiSettingsSetters };
