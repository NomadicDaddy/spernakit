import type { TabItem } from '@/components/layout/TabLayout';

/**
 * The account tab strip, and the source of each profile page's title. Split out for the same
 * reason as `settingsTabs`: `routes/useRouteAnnouncement.ts` reads it, and importing the layout
 * component to reach it would defeat the lazy loading of these pages.
 */
const profileTabs: TabItem[] = [
	{ label: 'Personal Info', to: '/profile/personal' },
	{ label: 'Preferences', to: '/profile/preferences' },
	{ label: 'Security', to: '/profile/security' },
	{ label: 'API Keys', to: '/profile/api-keys' },
];

export { profileTabs };
