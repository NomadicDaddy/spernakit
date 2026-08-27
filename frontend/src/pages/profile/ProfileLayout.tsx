import { TabLayout } from '@/components/layout/TabLayout';
import { profileTabs } from '@/pages/profile/profileTabs';

function ProfileLayout() {
	return (
		<TabLayout description="Manage your account settings" tabs={profileTabs} title="Account" />
	);
}

export { ProfileLayout };
