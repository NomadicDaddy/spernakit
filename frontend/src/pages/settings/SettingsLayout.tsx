import type { TabItem } from '@/components/layout/TabLayout';

import { trackEvent } from '@/api/businessMetrics';
import { TabLayout } from '@/components/layout/TabLayout';
import { useAuthorization } from '@/hooks/useAuthorization';

const tabs: TabItem[] = [
	{ label: 'Application', to: '/settings/application' },
	{ label: 'Authentication', minRole: 'SYSOP', to: '/settings/authentication' },
	{ label: 'Users', to: '/settings/users' },
	{ label: 'Roles', to: '/settings/roles' },
	{ label: 'Notifications', to: '/settings/notifications' },
	{ label: 'Email', minRole: 'SYSOP', to: '/settings/email' },
	{ label: 'System Health', to: '/settings/system-health' },
	{ label: 'Scheduled Tasks', to: '/settings/scheduled-tasks' },
	{ label: 'Audit Logs', to: '/settings/audit-logs' },
	{ label: 'Backup', minRole: 'SYSOP', to: '/settings/backup' },
	{ label: 'Database', minRole: 'SYSOP', to: '/settings/database' },
	{ label: 'Runtime Config', minRole: 'SYSOP', to: '/settings/runtime-config' },
	{ label: 'Bug Reports', to: '/settings/bugs' },
];

function SettingsLayout() {
	const { hasMinRole } = useAuthorization();
	const visibleTabs = tabs.filter((tab) => !tab.minRole || hasMinRole(tab.minRole));

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
