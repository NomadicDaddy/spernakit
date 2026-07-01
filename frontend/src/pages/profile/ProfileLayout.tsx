import type { TabItem } from '@/components/layout/TabLayout';

import { TabLayout } from '@/components/layout/TabLayout';

const tabs: TabItem[] = [
	{ label: 'Personal Info', to: '/profile/personal' },
	{ label: 'Preferences', to: '/profile/preferences' },
	{ label: 'Security', to: '/profile/security' },
	{ label: 'API Keys', to: '/profile/api-keys' },
];

function ProfileLayout() {
	return <TabLayout description="Manage your account settings" tabs={tabs} title="Account" />;
}

export { ProfileLayout };
