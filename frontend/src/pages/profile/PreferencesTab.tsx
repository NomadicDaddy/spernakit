import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
	getNotificationPreferences,
	type NotificationPreferences as NotificationPrefs,
	updateNotificationPreferences,
} from '@/api/notifications';
import { getUserUiSettings, updateUserUiSettings, type UserUiSettings } from '@/api/userSettings';
import { syncUiSettingsToStores } from '@/hooks/useSyncUiSettings';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useThemeStore } from '@/stores/themeStore';

import { DisplayPreferences } from './DisplayPreferences';
import { LayoutPreferences } from './LayoutPreferences';
import { NotificationPreferences } from './NotificationPreferences';
import { ThemePreferences } from './ThemePreferences';

function PreferencesTab() {
	const queryClient = useQueryClient();
	const themeMode = useThemeStore((s) => s.mode);
	const setThemeMode = useThemeStore((s) => s.setMode);
	const appTheme = useThemeStore((s) => s.appTheme);
	const setAppTheme = useThemeStore((s) => s.setAppTheme);
	const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed);
	const layoutMode = useLayoutStore((s) => s.layoutMode);
	const setLayoutMode = useLayoutStore((s) => s.setLayoutMode);
	const containerWidth = useLayoutStore((s) => s.containerWidth);
	const setContainerWidth = useLayoutStore((s) => s.setContainerWidth);
	const setDensity = useLayoutStore((s) => s.setDensity);

	const { data: prefsData, isLoading: prefsLoading } = useQuery({
		queryFn: getNotificationPreferences,
		queryKey: ['notification-preferences'],
	});

	const { data: uiSettingsData, isLoading: uiSettingsLoading } = useQuery({
		queryFn: getUserUiSettings,
		queryKey: ['user-ui-settings'],
	});

	const updatePrefsMutation = useMutation({
		mutationFn: updateNotificationPreferences,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
			toast.success('Notification preferences updated');
		},
	});

	const uiSetters = {
		setAppTheme,
		setContainerWidth,
		setDensity,
		setLayoutMode,
		setSidebarCollapsed,
		setThemeMode,
	};

	const updateUiSettingsMutation = useMutation({
		mutationFn: updateUserUiSettings,
		onSuccess: (data) => {
			void queryClient.invalidateQueries({ queryKey: ['user-ui-settings'] });
			if (data?.data) {
				syncUiSettingsToStores(data.data, uiSetters);
			}
			toast.success('UI preferences updated');
		},
	});

	const preferences = prefsData?.data;
	const uiSettings = uiSettingsData?.data;
	const uiSettingsPending = uiSettingsLoading || updateUiSettingsMutation.isPending;

	function handleToggle(key: keyof NotificationPrefs, checked: boolean) {
		if (!preferences) return;
		updatePrefsMutation.mutate({
			...preferences,
			[key]: checked,
		});
	}

	function handleUiSettingChange<K extends keyof UserUiSettings>(
		key: K,
		value: UserUiSettings[K]
	) {
		if (!uiSettings) return;
		updateUiSettingsMutation.mutate({
			...uiSettings,
			[key]: value,
		});
	}

	return (
		<div className="space-y-6">
			<ThemePreferences
				appTheme={appTheme}
				disabled={uiSettingsPending}
				onAppThemeChange={(theme) => handleUiSettingChange('appTheme', theme)}
				onThemeModeChange={(mode) => handleUiSettingChange('theme', mode)}
				themeMode={themeMode}
			/>

			<LayoutPreferences
				handlers={{
					onContainerWidthChange: (width) =>
						handleUiSettingChange('containerWidth', width),
					onLayoutModeChange: (mode) => handleUiSettingChange('layoutMode', mode),
					onSidebarCollapsedChange: (collapsed) =>
						handleUiSettingChange('sidebarCollapsed', collapsed),
				}}
				settings={{
					containerWidth,
					disabled: uiSettingsPending,
					layoutMode,
					sidebarCollapsed: uiSettings?.sidebarCollapsed ?? false,
				}}
			/>

			<DisplayPreferences
				disabled={uiSettingsPending}
				onChange={handleUiSettingChange}
				uiSettings={uiSettings}
			/>

			<NotificationPreferences
				disabled={updatePrefsMutation.isPending}
				isLoading={prefsLoading}
				onToggle={handleToggle}
				preferences={preferences}
			/>
		</div>
	);
}

export { PreferencesTab };
