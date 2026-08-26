import { trackEvent } from '@/api/businessMetrics';
import { TabLayout } from '@/components/layout/TabLayout';
import { useAuthorization } from '@/hooks/useAuthorization';
import { settingsTabs } from '@/pages/settings/settingsTabs';

function SettingsLayout() {
	const { hasMinRole } = useAuthorization();
	const visibleTabs = settingsTabs.filter((tab) => !tab.minRole || hasMinRole(tab.minRole));

	return (
		<TabLayout
			description="Manage application configuration"
			onTabClick={(tab) => {
				void trackEvent({
					eventCategory: 'user_action',
					eventName: 'settings_tab_change',
					metadata: { tab: tab.to },
				});
			}}
			tabs={visibleTabs}
			title="Settings"
		/>
	);
}

export { SettingsLayout };
