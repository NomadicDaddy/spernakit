import type { TabItem } from '@/components/layout/TabLayout';

/**
 * The settings tab strip, and the source of each settings page's title.
 *
 * Kept in a module of its own so `routes/useRouteAnnouncement.ts` can name these pages from the
 * same labels the tabs render. Importing `SettingsLayout` for them would pull `TabLayout`,
 * `useAuthorization` and the analytics client into the app shell, and every settings page is
 * lazily loaded precisely to keep them out of it. Nothing here imports anything at runtime.
 */
const settingsTabs: TabItem[] = [
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

export { settingsTabs };
